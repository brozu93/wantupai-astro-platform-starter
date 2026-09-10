import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import type { Translate } from '../../i18n/ui';
import { useTranslations } from '../../i18n/ui';
import { FONT_OPTIONS, loadFonts } from '../../lib/nametag/fonts';
import { fontIdsUsed, layoutTag } from '../../lib/nametag/layout';
import { maxEngraveDepth, mountingLayout } from '../../lib/nametag/mounting';
import { BEDS, DEFAULT_BED, PLATE_LIMITS, arrangePlate, findBed } from '../../lib/nametag/plate';
import { DEFAULT_PRESET, LIMITS, PRESETS } from '../../lib/nametag/presets';
import type { FontData, FontId, Mounting, NametagSpec, Relief, TagLayout, TagLine } from '../../lib/nametag/types';
import { NumberField, Section, Segmented, SelectField, TextField, Toggle } from '../ui/controls';
import PaywallDialog from './PaywallDialog';
import PlatePreview from './PlatePreview';
import TagPreview from './TagPreview';

const LICENCE_STORAGE_KEY = 'kakas.licence';
/** PLA is about 1.24 g/cm³; close enough for a filament estimate. */
const PLA_DENSITY = 0.00124;
/** Clearance kept free at the bed edge, in mm. Enough room for a brim on every printer here. */
const PLATE_MARGIN = 5;

interface LicenceView {
    key: string;
    plan: string;
    credits: number;
    unlimited: boolean;
    demo: boolean;
    designs: number;
    subscription: { status: string; currentPeriodEnd: string } | null;
}

const LINE_ROLE_KEYS = ['studio.role.name', 'studio.role.title', 'studio.role.dept', 'studio.role.extra'] as const;

interface Props {
    lang?: Lang;
}

export default function NametagStudio({ lang = DEFAULT_LANG }: Props) {
    const t = useTranslations(lang);
    const [spec, setSpec] = useState<NametagSpec>(() => structuredClone(DEFAULT_PRESET.spec));
    const [fonts, setFonts] = useState<Map<FontId, FontData> | null>(null);
    const [view, setView] = useState<'front' | 'back' | 'plate'>('front');
    const [licence, setLicence] = useState<LicenceView | null>(null);
    const [licenceInput, setLicenceInput] = useState('');
    const [licenceError, setLicenceError] = useState<string | null>(null);
    const [busy, setBusy] = useState<null | 'stl' | 'sample' | 'batch' | 'plate' | 'licence'>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [notes, setNotes] = useState<string[]>([]);
    const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false });
    const [batchText, setBatchText] = useState('');
    const [bedId, setBedId] = useState<string>(DEFAULT_BED.id);
    const [customBed, setCustomBed] = useState({ width: 220, height: 220 });
    const [spacing, setSpacing] = useState(5);
    /** Zero means the packer chooses; anything else forces that many columns. */
    const [plateColumns, setPlateColumns] = useState(0);

    // Glyph outlines are fetched per weight, so switching a font pulls only what it needs.
    useEffect(() => {
        let cancelled = false;
        loadFonts(fontIdsUsed(spec)).then((loaded) => {
            if (!cancelled) setFonts((previous) => mergeFonts(previous, loaded));
        });
        return () => {
            cancelled = true;
        };
    }, [spec.lines.map((line) => line.font).join(',')]);

    const verifyLicence = useCallback(async (key: string, quiet = false) => {
        if (!key.trim()) return;
        if (!quiet) setBusy('licence');
        setLicenceError(null);
        try {
            const response = await fetch('/api/billing/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenceKey: key, lang })
            });
            const data = (await response.json()) as { ok: boolean; licence?: LicenceView; error?: string };
            if (!response.ok || !data.licence) throw new Error(data.error ?? t('licence.invalid'));
            setLicence(data.licence);
            setLicenceInput(data.licence.key);
            window.localStorage.setItem(LICENCE_STORAGE_KEY, data.licence.key);
        } catch (error) {
            if (!quiet) setLicenceError((error as Error).message);
            window.localStorage.removeItem(LICENCE_STORAGE_KEY);
        } finally {
            setBusy(null);
        }
    }, []);

    // A saved key is re-checked on load rather than trusted, so an expired plan shows honestly.
    useEffect(() => {
        const saved = window.localStorage.getItem(LICENCE_STORAGE_KEY);
        if (saved) {
            setLicenceInput(saved);
            void verifyLicence(saved, true);
        }
    }, [verifyLicence]);

    const layout: TagLayout | null = useMemo(() => {
        if (!fonts) return null;
        try {
            return layoutTag(spec, fonts);
        } catch {
            // A font weight that has not finished loading yet; the next render picks it up.
            return null;
        }
    }, [spec, fonts]);

    // One row per tag. Splitting here rather than at download time lets the plate preview,
    // the tag count and the request body all read from the same parse.
    const batchRows = useMemo(
        () =>
            batchText
                .split('\n')
                .map((row) => row.split('|').map((field) => field.trim()))
                .filter((fields) => fields.some((field) => field !== '')),
        [batchText]
    );

    const bed = useMemo(() => {
        const preset = findBed(bedId);
        return preset ?? { id: 'custom', label: t('studio.bed.custom'), width: customBed.width, height: customBed.height };
    }, [bedId, customBed]);

    const arrangement = useMemo(
        () =>
            arrangePlate(spec.width, spec.height, Math.max(1, batchRows.length), {
                bedWidth: bed.width,
                bedHeight: bed.height,
                spacing,
                margin: PLATE_MARGIN,
                columns: plateColumns > 0 ? plateColumns : undefined,
                lang
            }),
        [spec.width, spec.height, batchRows.length, bed.width, bed.height, spacing, plateColumns, lang]
    );

    // Laid out once per distinct row: a name repeated to get a spare copy is free after the first.
    const rowLayouts = useMemo<Array<TagLayout | null>>(() => {
        if (!fonts || batchRows.length === 0) return [];
        const cache = new Map<string, TagLayout | null>();
        return batchRows.map((fields) => {
            const cacheKey = fields.join('\u0000');
            if (!cache.has(cacheKey)) {
                const lines = spec.lines.map((line, i) => ({ ...line, text: fields[i] ?? '' })).filter((line) => line.text !== '');
                try {
                    cache.set(cacheKey, lines.length > 0 ? layoutTag({ ...spec, lines }, fonts) : null);
                } catch {
                    cache.set(cacheKey, null);
                }
            }
            return cache.get(cacheKey) ?? null;
        });
    }, [batchRows, spec, fonts]);

    // With no list yet, the plate view shows the design on its own so the bed is never blank.
    const plateLayouts = batchRows.length > 0 ? rowLayouts : [layout];

    const mounting = useMemo(() => mountingLayout(spec), [spec]);
    const engraveLimit = useMemo(() => maxEngraveDepth(spec, mounting), [spec, mounting]);
    const estimatedGrams = useMemo(() => spec.width * spec.height * spec.thickness * PLA_DENSITY, [spec]);

    function update(patch: Partial<NametagSpec>) {
        setSpec((current) => ({ ...current, ...patch }));
    }

    function updateLine(index: number, patch: Partial<TagLine>) {
        setSpec((current) => ({
            ...current,
            lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line))
        }));
    }

    function applyPreset(id: string) {
        const preset = PRESETS.find((item) => item.id === id);
        if (!preset) return;
        // Keep whatever the customer has typed; only the plate settings come from the preset.
        setSpec((current) => {
            const next = structuredClone(preset.spec);
            next.lines = next.lines.map((line, i) => (current.lines[i]?.text ? { ...line, text: current.lines[i].text } : line));
            return next;
        });
    }

    function addLine() {
        if (spec.lines.length >= LIMITS.maxLines) return;
        setSpec((current) => ({
            ...current,
            lines: [...current.lines, { text: '', font: 'sans-regular', size: 2.8, tracking: 0, transform: 'none' }]
        }));
    }

    function removeLine(index: number) {
        setSpec((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }));
    }

    async function saveBlob(response: Response, fallbackName: string) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filenameFrom(response) ?? fallbackName;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    async function downloadSample() {
        setBusy('sample');
        setStatus(null);
        try {
            const response = await fetch(`/api/nametag/sample?preset=${encodeURIComponent(spec.preset)}&lang=${lang}`);
            if (!response.ok) throw new Error(t('studio.error.sample'));
            setNotes(readNotes(response));
            await saveBlob(response, 'kakas-contoh.stl');
            setStatus(t('studio.status.sample'));
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(null);
        }
    }

    async function downloadStl() {
        if (!licence) {
            setPaywall({ open: true });
            return;
        }
        setBusy('stl');
        setStatus(null);
        try {
            const response = await fetch('/api/nametag/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenceKey: licence.key, spec, lang })
            });

            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                if (response.status === 402) {
                    setPaywall({ open: true, reason: data.error });
                    return;
                }
                throw new Error(data.error ?? t('studio.error.stl'));
            }

            const repeat = response.headers.get('X-Kakas-Repeat') === '1';
            const credits = response.headers.get('X-Kakas-Credits');
            setNotes(readNotes(response));
            await saveBlob(response, 'kakas-nametag.stl');
            setLicence((current) => (current && credits !== null ? { ...current, credits: Number(credits) } : current));
            setStatus(repeat ? t('studio.status.repeat') : t('studio.status.stlDone'));
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(null);
        }
    }

    async function downloadBatch() {
        if (!licence?.unlimited) {
            setPaywall({ open: true, reason: t('api.batch.subOnly') });
            return;
        }
        if (batchRows.length === 0) {
            setStatus(t('studio.list.needRow'));
            return;
        }

        setBusy('batch');
        setStatus(null);
        try {
            const response = await fetch('/api/nametag/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenceKey: licence.key, spec, rows: batchRows, lang })
            });
            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error ?? t('studio.error.zip'));
            }
            const count = response.headers.get('X-Kakas-Count');
            setNotes(readNotes(response));
            await saveBlob(response, 'kakas-nametag.zip');
            setStatus(`${count ?? batchRows.length} tag dijana dalam satu fail ZIP.`);
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(null);
        }
    }

    /** The whole list as one print job, rather than a folder of files to arrange by hand. */
    async function downloadPlate() {
        if (!licence?.unlimited) {
            setPaywall({ open: true, reason: t('api.plate.subOnly') });
            return;
        }
        if (batchRows.length === 0) {
            setStatus(t('studio.list.needRow'));
            return;
        }
        if (!arrangement.fits) {
            setStatus(arrangement.notes[0] ?? t('studio.plate.noFit'));
            return;
        }

        setBusy('plate');
        setStatus(null);
        try {
            const response = await fetch('/api/nametag/plate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    licenceKey: licence.key,
                    spec,
                    rows: batchRows,
                    lang,
                    plate: { bedWidth: bed.width, bedHeight: bed.height, spacing, margin: PLATE_MARGIN, columns: plateColumns }
                })
            });
            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error ?? t('studio.error.plate'));
            }

            const count = response.headers.get('X-Kakas-Count') ?? String(batchRows.length);
            const plates = Number(response.headers.get('X-Kakas-Plates') ?? '1');
            const size = response.headers.get('X-Kakas-Size')?.replace('x', ' × ');
            setNotes(readNotes(response));
            await saveBlob(response, plates > 1 ? 'kakas-plat.zip' : 'kakas-plat.stl');
            setStatus(
                plates > 1
                    ? `${count} tag disusun atas ${plates} plat — satu fail ZIP, satu fail untuk setiap kali cetak.`
                    : `${count} tag disusun atas satu plat ${size} mm. Buka satu fail, cetak sekali.`
            );
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(null);
        }
    }

    function signOut() {
        window.localStorage.removeItem(LICENCE_STORAGE_KEY);
        setLicence(null);
        setLicenceInput('');
    }

    const warnings = layout?.warnings ?? [];

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
            {/* ---------- Controls ---------- */}
            <div className="space-y-4 lg:sticky lg:top-20">
                <Section title={t('studio.section.type')} summary={t('studio.section.typeSummary')} open>
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPreset(preset.id)}
                                aria-pressed={spec.preset === preset.id}
                                className={`btn btn-xs ${spec.preset === preset.id ? 'btn-primary' : 'btn-outline border-white/15 text-graphite-200'}`}
                            >
                                {t(`preset.${preset.id}.label` as 'preset.guru.label')}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-graphite-400">{t(`preset.${spec.preset}.description` as 'preset.guru.description')}</p>
                </Section>

                <Section title={t('studio.section.text')} summary={t('studio.section.textSummary', { count: spec.lines.length })} open>
                    {spec.lines.map((line, index) => (
                        <div key={index} className="space-y-3 rounded-lg border border-white/10 bg-graphite-900/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-graphite-400">{t(LINE_ROLE_KEYS[index] ?? 'studio.role.extra')}</span>
                                {spec.lines.length > 1 && (
                                    <button type="button" className="btn btn-ghost btn-xs text-graphite-400" onClick={() => removeLine(index)}>
                                        {t('studio.line.remove')}
                                    </button>
                                )}
                            </div>

                            <TextField
                                label={t('studio.field.words')}
                                value={line.text}
                                maxLength={LIMITS.maxCharsPerLine}
                                placeholder={index === 0 ? 'MOHAMAD ZAID BIN ABDULLAH' : 'Guru Reka Bentuk & Teknologi'}
                                onChange={(text) => updateLine(index, { text })}
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
                                <SelectField
                                    label={t('studio.field.font')}
                                    value={line.font}
                                    options={FONT_OPTIONS.map((option) => ({ value: option.id, label: t(`font.${option.id}` as 'font.sans-bold') }))}
                                    onChange={(font) => updateLine(index, { font })}
                                />
                                <SelectField
                                    label={t('studio.field.case')}
                                    value={line.transform}
                                    options={[
                                        { value: 'upper', label: t('studio.case.upper') },
                                        { value: 'none', label: t('studio.case.asTyped') }
                                    ]}
                                    onChange={(transform) => updateLine(index, { transform })}
                                />
                            </div>

                            <NumberField
                                label={t('studio.field.capHeight')}
                                value={line.size}
                                min={LIMITS.lineSize.min}
                                max={Math.min(LIMITS.lineSize.max, spec.height)}
                                step={0.1}
                                onChange={(size) => updateLine(index, { size })}
                            />
                            <NumberField
                                label={t('studio.field.tracking')}
                                value={line.tracking}
                                min={LIMITS.tracking.min}
                                max={LIMITS.tracking.max}
                                step={0.05}
                                onChange={(tracking) => updateLine(index, { tracking })}
                            />
                        </div>
                    ))}

                    {spec.lines.length < LIMITS.maxLines && (
                        <button type="button" className="btn btn-outline btn-sm w-full border-white/15" onClick={addLine}>
                            + Tambah baris
                        </button>
                    )}
                </Section>

                <Section title={t('studio.section.size')} summary={`${spec.width} × ${spec.height} × ${spec.thickness} mm`}>
                    <NumberField label={t('studio.field.width')} value={spec.width} min={LIMITS.width.min} max={LIMITS.width.max} step={0.5} onChange={(width) => update({ width })} />
                    <NumberField label={t('studio.field.height')} value={spec.height} min={LIMITS.height.min} max={LIMITS.height.max} step={0.5} onChange={(height) => update({ height })} />
                    <NumberField
                        label={t('studio.field.thickness')}
                        value={spec.thickness}
                        min={LIMITS.thickness.min}
                        max={LIMITS.thickness.max}
                        step={0.1}
                        onChange={(thickness) => update({ thickness })}
                    />
                    <NumberField
                        label={t('studio.field.corner')}
                        value={spec.cornerRadius}
                        min={LIMITS.cornerRadius.min}
                        max={Math.min(LIMITS.cornerRadius.max, Math.min(spec.width, spec.height) / 2)}
                        step={0.5}
                        onChange={(cornerRadius) => update({ cornerRadius })}
                    />
                </Section>

                <Section title={t('studio.section.finish')} summary={spec.relief === 'emboss' ? `Timbul ${spec.reliefDepth} mm` : `Ukir ${Math.min(spec.reliefDepth, engraveLimit).toFixed(1)} mm`}>
                    <Segmented
                        label="Gaya"
                        value={spec.relief}
                        options={[
                            { value: 'emboss', label: t('studio.relief.emboss') },
                            { value: 'engrave', label: t('studio.relief.engrave') }
                        ]}
                        onChange={(relief: Relief) => update({ relief })}
                    />
                    <NumberField
                        label={t(spec.relief === 'emboss' ? 'studio.field.reliefDepthEmboss' : 'studio.field.reliefDepthEngrave')}
                        value={spec.reliefDepth}
                        min={LIMITS.reliefDepth.min}
                        max={LIMITS.reliefDepth.max}
                        step={0.1}
                        onChange={(reliefDepth) => update({ reliefDepth })}
                        hint={
                            spec.relief === 'engrave' && spec.reliefDepth > engraveLimit
                                ? `Dihadkan kepada ${engraveLimit.toFixed(1)} mm oleh poket di belakang.`
                                : spec.relief === 'emboss'
                                  ? t('studio.field.capHeightHint')
                                  : undefined
                        }
                    />
                    <Toggle
                        label={t('studio.field.frame')}
                        checked={spec.frame.enabled}
                        onChange={(enabled) => update({ frame: { ...spec.frame, enabled } })}
                        hint={t('studio.field.frameHint')}
                    />
                    {spec.frame.enabled && (
                        <>
                            <NumberField
                                label={t('studio.field.frameInset')}
                                value={spec.frame.inset}
                                min={LIMITS.frameInset.min}
                                max={LIMITS.frameInset.max}
                                step={0.1}
                                onChange={(inset) => update({ frame: { ...spec.frame, inset } })}
                            />
                            <NumberField
                                label={t('studio.field.frameWidth')}
                                value={spec.frame.width}
                                min={LIMITS.frameWidth.min}
                                max={LIMITS.frameWidth.max}
                                step={0.1}
                                onChange={(width) => update({ frame: { ...spec.frame, width } })}
                            />
                        </>
                    )}
                </Section>

                <Section title={t('studio.section.mounting')} summary={mountingLabel(spec.mounting, t)}>
                    <Segmented
                        label={t('studio.field.mounting')}
                        value={spec.mounting}
                        options={[
                            { value: 'magnet', label: t('mount.magnet') },
                            { value: 'pin', label: t('mount.pin') },
                            { value: 'lanyard', label: 'Tali' },
                            { value: 'none', label: 'Rata' }
                        ]}
                        onChange={(mounting: Mounting) => update({ mounting })}
                    />

                    {spec.mounting === 'magnet' && (
                        <>
                            <Segmented
                                label={t('studio.field.magnetCount')}
                                value={String(spec.magnet.count) as '1' | '2'}
                                options={[
                                    { value: '1', label: '1 magnet' },
                                    { value: '2', label: '2 magnet' }
                                ]}
                                onChange={(value) => update({ magnet: { ...spec.magnet, count: value === '1' ? 1 : 2 } })}
                            />
                            <NumberField
                                label={t('studio.field.magnetDiameter')}
                                value={spec.magnet.diameter}
                                min={LIMITS.magnetDiameter.min}
                                max={LIMITS.magnetDiameter.max}
                                step={0.5}
                                onChange={(diameter) => update({ magnet: { ...spec.magnet, diameter } })}
                            />
                            <NumberField
                                label={t('studio.field.magnetThickness')}
                                value={spec.magnet.thickness}
                                min={LIMITS.magnetThickness.min}
                                max={LIMITS.magnetThickness.max}
                                step={0.5}
                                onChange={(thickness) => update({ magnet: { ...spec.magnet, thickness } })}
                                hint={t('studio.magnet.hint')}
                            />
                        </>
                    )}
                    {spec.mounting === 'pin' && <p className="text-xs text-graphite-400">{t('studio.pin.hint')}</p>}
                    {spec.mounting === 'lanyard' && <p className="text-xs text-graphite-400">{t('studio.lanyard.hint')}</p>}
                </Section>

                <Section title={t('studio.section.layout')} summary={`${spec.align === 'center' ? 'Tengah' : 'Kiri'} · jidar ${spec.marginX} mm`}>
                    <Segmented
                        label={t('studio.field.align')}
                        value={spec.align}
                        options={[
                            { value: 'center', label: t('studio.align.center') },
                            { value: 'left', label: t('studio.align.left') }
                        ]}
                        onChange={(align) => update({ align })}
                    />
                    <NumberField label={t('studio.field.marginX')} value={spec.marginX} min={LIMITS.marginX.min} max={LIMITS.marginX.max} step={0.5} onChange={(marginX) => update({ marginX })} />
                    <NumberField label={t('studio.field.marginY')} value={spec.marginY} min={LIMITS.marginY.min} max={LIMITS.marginY.max} step={0.5} onChange={(marginY) => update({ marginY })} />
                    <NumberField label={t('studio.field.lineGap')} value={spec.lineGap} min={LIMITS.lineGap.min} max={LIMITS.lineGap.max} step={0.1} onChange={(lineGap) => update({ lineGap })} />
                </Section>
            </div>

            {/* ---------- Preview and actions ---------- */}
            <div className="space-y-5">
                <div className="panel overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div className="join">
                            <button type="button" className={`btn btn-sm join-item ${view === 'front' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('front')}>
                                {t('studio.view.front')}
                            </button>
                            <button type="button" className={`btn btn-sm join-item ${view === 'back' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('back')}>
                                {t('studio.view.back')}
                            </button>
                            <button type="button" className={`btn btn-sm join-item ${view === 'plate' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('plate')}>
                                {t('studio.view.plate')}
                                {batchRows.length > 0 && <span className="ml-1.5 text-[10px] opacity-70">{batchRows.length}</span>}
                            </button>
                        </div>
                        <p className="tabular text-xs text-graphite-400">
                            {view === 'plate' ? (
                                <>
                                    {arrangement.width.toFixed(1)} × {arrangement.height.toFixed(1)} × {spec.thickness} mm · ±{' '}
                                    {(estimatedGrams * Math.max(1, arrangement.placed)).toFixed(1)} g PLA
                                </>
                            ) : (
                                <>
                                    {spec.width} × {spec.height} × {spec.thickness} mm · ± {estimatedGrams.toFixed(1)} g PLA
                                </>
                            )}
                        </p>
                    </div>

                    <div className="bg-graphite-950/60 p-5 sm:p-8">
                        {!fonts ? (
                            <div className="flex h-40 items-center justify-center text-sm text-graphite-400">{t('studio.preview.loading')}</div>
                        ) : view === 'plate' ? (
                            <PlatePreview lang={lang} spec={spec} arrangement={arrangement} layouts={plateLayouts} bedWidth={bed.width} bedHeight={bed.height} showBed />
                        ) : (
                            <TagPreview lang={lang} spec={spec} layout={layout} view={view} />
                        )}
                    </div>

                    {view === 'plate' && (
                        <div className="space-y-1 border-t border-white/10 px-4 py-3 text-xs">
                            <p className="tabular text-graphite-300">
                                {t('studio.plate.units', {
                                    count: arrangement.placed,
                                    columns: arrangement.columns,
                                    rows: arrangement.rows,
                                    spacing: arrangement.spacing,
                                    bed: bed.label,
                                    bedWidth: bed.width,
                                    bedHeight: bed.height
                                })}
                            </p>
                            <p className="text-graphite-400">
                                {arrangement.fits
                                    ? t('studio.plate.capacity', { capacity: arrangement.capacity })
                                    : t('studio.plate.tooBigShort')}
                            </p>
                            {arrangement.notes.map((note) => (
                                <p key={note} className="text-warning">
                                    {note}
                                </p>
                            ))}
                        </div>
                    )}

                    {warnings.length > 0 && (
                        <ul className="space-y-1 border-t border-white/10 bg-warning/10 px-4 py-3 text-xs text-warning">
                            {warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="panel space-y-4 p-4">
                    <div className="flex flex-wrap gap-3">
                        <button type="button" className="btn btn-primary" onClick={downloadStl} disabled={busy !== null}>
                            {busy === 'stl' ? t('studio.busy.generating') : licence ? t('studio.download.stl') : t('studio.download.unlock')}
                        </button>
                        <button type="button" className="btn btn-outline border-white/20" onClick={downloadSample} disabled={busy !== null}>
                            {busy === 'sample' ? t('studio.busy.generating') : t('studio.download.sample')}
                        </button>
                    </div>

                    {status && <p className="rounded-lg bg-graphite-900/70 px-3 py-2 text-sm">{status}</p>}

                    {notes.length > 0 && (
                        <ul className="space-y-1 text-xs text-graphite-300">
                            {notes.map((note) => (
                                <li key={note} className="flex gap-2">
                                    <span aria-hidden="true" className="text-brass-400">
                                        ▸
                                    </span>
                                    {note}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="panel space-y-3 p-4">
                    <h2 className="text-sm font-semibold">{t('licence.title')}</h2>
                    {licence ? (
                        <div className="space-y-2 text-sm">
                            <p className="tabular break-all text-graphite-200">
                                <span className="text-graphite-400">{t('licence.keyLabel')}</span> {licence.key}
                            </p>
                            <p className="text-graphite-300">
                                {licence.unlimited
                                    ? t('licence.unlimited')
                                    : `${licence.credits} kredit reka bentuk berbaki. Reka bentuk yang sudah dibeli boleh dimuat turun semula percuma.`}
                            </p>
                            {licence.demo && (
                                <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
                                    Lesen demo — dikeluarkan tanpa pembayaran sebenar kerana gerbang pembayaran belum dikonfigurasikan di tapak ini.
                                </p>
                            )}
                            <button type="button" className="btn btn-ghost btn-xs text-graphite-400" onClick={signOut}>
                                {t('licence.signOut')}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                                <input
                                    type="text"
                                    className="input input-bordered input-sm tabular min-w-0 grow bg-graphite-900/70"
                                    placeholder={t('licence.placeholder')}
                                    value={licenceInput}
                                    onChange={(event) => setLicenceInput(event.target.value)}
                                />
                                <button type="button" className="btn btn-sm" onClick={() => verifyLicence(licenceInput)} disabled={busy !== null}>
                                    {busy === 'licence' ? t('licence.checking') : t('licence.use')}
                                </button>
                            </div>
                            {licenceError && <p className="text-xs text-error">{licenceError}</p>}
                            <p className="text-xs text-graphite-400">
                                {t('licence.noneBefore')}{' '}
                                <a href="/harga" className="underline underline-offset-4">
                                    {t('licence.noneLink')}
                                </a>
                                .
                            </p>
                        </div>
                    )}
                </div>

                <details className="panel" open={batchRows.length > 0}>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                        {t('studio.list.title')}
                        {batchRows.length > 0 && <span className="ml-2 text-xs font-normal text-graphite-400">{t('studio.list.count', { count: batchRows.length })}</span>}
                        <span className="ml-2 rounded bg-brass-400/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brass-300">{t('studio.list.badge')}</span>
                    </summary>
                    <div className="space-y-4 border-t border-white/10 px-4 py-4">
                        <div className="space-y-2">
                            <p className="text-xs text-graphite-300">
                                Satu baris untuk setiap tag. Pisahkan medan dengan <code>|</code> mengikut susunan baris teks di sebelah kiri. Semua tetapan
                                lain mengikut reka bentuk semasa. Ulang nama pada baris lain untuk dapat salinan tambahan.
                            </p>
                            <textarea
                                className="textarea textarea-bordered h-40 w-full bg-graphite-900/70 font-mono text-xs"
                                placeholder={'NURUL AIN BINTI HASSAN | Guru Bahasa Melayu\nAHMAD FAIZ BIN OTHMAN | Guru Matematik'}
                                value={batchText}
                                onChange={(event) => setBatchText(event.target.value)}
                                aria-label={t('studio.list.aria')}
                            />
                            <p className="text-xs text-graphite-400">{t('studio.list.max', { max: LIMITS.maxBatchRows })}</p>
                        </div>

                        <div className="space-y-3 border-t border-white/10 pt-4">
                            <SelectField
                                label={t('studio.bed.label')}
                                value={bedId}
                                options={[...BEDS.map((item) => ({ value: item.id, label: `${item.label} — ${item.width} × ${item.height} mm` })), { value: 'custom', label: t('studio.bed.custom') }]}
                                onChange={setBedId}
                                hint={t('studio.bed.hint')}
                            />

                            {bedId === 'custom' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <NumberField
                                        label={t('studio.bed.width')}
                                        value={customBed.width}
                                        min={PLATE_LIMITS.bed.min}
                                        max={PLATE_LIMITS.bed.max}
                                        step={10}
                                        onChange={(width) => setCustomBed((current) => ({ ...current, width }))}
                                    />
                                    <NumberField
                                        label={t('studio.bed.depth')}
                                        value={customBed.height}
                                        min={PLATE_LIMITS.bed.min}
                                        max={PLATE_LIMITS.bed.max}
                                        step={10}
                                        onChange={(height) => setCustomBed((current) => ({ ...current, height }))}
                                    />
                                </div>
                            )}

                            <NumberField
                                label={t('studio.spacing.label')}
                                value={spacing}
                                min={PLATE_LIMITS.spacing.min}
                                max={PLATE_LIMITS.spacing.max}
                                step={0.5}
                                onChange={setSpacing}
                                hint={t('studio.spacing.hint')}
                            />

                            <NumberField
                                label={t('studio.columns.label')}
                                value={plateColumns}
                                min={0}
                                max={PLATE_LIMITS.columns.max}
                                step={1}
                                unit={t(plateColumns === 0 ? 'studio.columns.auto' : 'studio.columns.unit')}
                                onChange={(columns) => setPlateColumns(Math.round(columns))}
                                hint={t('studio.columns.hint')}
                            />

                            <p className="tabular rounded-lg bg-graphite-900/70 px-3 py-2 text-xs text-graphite-300">
                                {arrangement.fits
                                    ? t('studio.plate.summary', {
                                          columns: arrangement.columns,
                                          rows: arrangement.rows,
                                          width: arrangement.width.toFixed(1),
                                          height: arrangement.height.toFixed(1),
                                          capacity: arrangement.capacity
                                      })
                                    : t('studio.plate.tooBig')}{' '}
                                <button type="button" className="underline underline-offset-4" onClick={() => setView('plate')}>
                                    {t('studio.plate.viewLink')}
                                </button>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                            <button type="button" className="btn btn-primary btn-sm" onClick={downloadPlate} disabled={busy !== null}>
                                {busy === 'plate' ? t('studio.list.arranging') : t('studio.list.downloadPlate')}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm border-white/20" onClick={downloadBatch} disabled={busy !== null}>
                                {busy === 'batch' ? t('studio.busy.generating') : t('studio.list.downloadZip')}
                            </button>
                        </div>
                        <p className="text-xs text-graphite-400">
                            Satu plat memberi satu fail yang sudah tersusun — buka dalam penghiris, tekan cetak sekali. ZIP memberi satu fail bagi setiap
                            nama, untuk disusun sendiri atau dicetak berasingan.
                        </p>
                    </div>
                </details>
            </div>

            <PaywallDialog open={paywall.open} reason={paywall.reason} onClose={() => setPaywall({ open: false })} />
        </div>
    );
}

function mergeFonts(previous: Map<FontId, FontData> | null, loaded: Map<FontId, FontData>): Map<FontId, FontData> {
    const merged = new Map(previous ?? []);
    for (const [id, data] of loaded) merged.set(id, data);
    return merged;
}

function mountingLabel(mounting: Mounting, t: Translate): string {
    return t(`mount.${mounting}.long` as 'mount.none.long');
}

function readNotes(response: Response): string[] {
    const raw = response.headers.get('X-Kakas-Notes');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
        return Array.isArray(parsed) ? parsed.filter((note): note is string => typeof note === 'string') : [];
    } catch {
        return [];
    }
}

function filenameFrom(response: Response): string | null {
    const header = response.headers.get('Content-Disposition');
    if (!header) return null;
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf8) return decodeURIComponent(utf8[1]);
    const plain = /filename="([^"]+)"/i.exec(header);
    return plain ? plain[1] : null;
}
