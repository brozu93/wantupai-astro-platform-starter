import { useCallback, useEffect, useMemo, useState } from 'react';
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

const LINE_ROLES = ['Nama', 'Jawatan', 'Jabatan / Sekolah', 'Baris tambahan'];

export default function NametagStudio() {
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
                body: JSON.stringify({ licenceKey: key })
            });
            const data = (await response.json()) as { ok: boolean; licence?: LicenceView; error?: string };
            if (!response.ok || !data.licence) throw new Error(data.error ?? 'Kunci lesen tidak sah.');
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
        return preset ?? { id: 'custom', label: 'Tersuai', width: customBed.width, height: customBed.height };
    }, [bedId, customBed]);

    const arrangement = useMemo(
        () =>
            arrangePlate(spec.width, spec.height, Math.max(1, batchRows.length), {
                bedWidth: bed.width,
                bedHeight: bed.height,
                spacing,
                margin: PLATE_MARGIN,
                columns: plateColumns > 0 ? plateColumns : undefined
            }),
        [spec.width, spec.height, batchRows.length, bed.width, bed.height, spacing, plateColumns]
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
            const response = await fetch(`/api/nametag/sample?preset=${encodeURIComponent(spec.preset)}`);
            if (!response.ok) throw new Error('Gagal menjana fail contoh.');
            setNotes(readNotes(response));
            await saveBlob(response, 'kakas-contoh.stl');
            setStatus('Fail contoh dimuat turun. Cetak dulu untuk uji tetapan pencetak anda.');
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
                body: JSON.stringify({ licenceKey: licence.key, spec })
            });

            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                if (response.status === 402) {
                    setPaywall({ open: true, reason: data.error });
                    return;
                }
                throw new Error(data.error ?? 'Gagal menjana STL.');
            }

            const repeat = response.headers.get('X-Kakas-Repeat') === '1';
            const credits = response.headers.get('X-Kakas-Credits');
            setNotes(readNotes(response));
            await saveBlob(response, 'kakas-nametag.stl');
            setLicence((current) => (current && credits !== null ? { ...current, credits: Number(credits) } : current));
            setStatus(repeat ? 'Reka bentuk sama seperti sebelum ini — muat turun semula tidak menggunakan kredit.' : 'STL siap dimuat turun.');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(null);
        }
    }

    async function downloadBatch() {
        if (!licence?.unlimited) {
            setPaywall({ open: true, reason: 'Mod senarai memerlukan langganan bulanan yang aktif.' });
            return;
        }
        if (batchRows.length === 0) {
            setStatus('Masukkan sekurang-kurangnya satu baris dalam senarai.');
            return;
        }

        setBusy('batch');
        setStatus(null);
        try {
            const response = await fetch('/api/nametag/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenceKey: licence.key, spec, rows: batchRows })
            });
            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error ?? 'Gagal menjana senarai.');
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
            setPaywall({ open: true, reason: 'Mod plat memerlukan langganan bulanan yang aktif.' });
            return;
        }
        if (batchRows.length === 0) {
            setStatus('Masukkan sekurang-kurangnya satu baris dalam senarai.');
            return;
        }
        if (!arrangement.fits) {
            setStatus(arrangement.notes[0] ?? 'Tag tidak muat pada dandang ini.');
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
                    plate: { bedWidth: bed.width, bedHeight: bed.height, spacing, margin: PLATE_MARGIN, columns: plateColumns }
                })
            });
            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error ?? 'Gagal menjana plat.');
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
                <Section title="Jenis tag" summary="Mula dari saiz yang sudah lazim digunakan" open>
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPreset(preset.id)}
                                aria-pressed={spec.preset === preset.id}
                                className={`btn btn-xs ${spec.preset === preset.id ? 'btn-primary' : 'btn-outline border-white/15 text-graphite-200'}`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-graphite-400">{PRESETS.find((preset) => preset.id === spec.preset)?.description}</p>
                </Section>

                <Section title="Teks" summary={`${spec.lines.length} baris`} open>
                    {spec.lines.map((line, index) => (
                        <div key={index} className="space-y-3 rounded-lg border border-white/10 bg-graphite-900/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-graphite-400">{LINE_ROLES[index] ?? `Baris ${index + 1}`}</span>
                                {spec.lines.length > 1 && (
                                    <button type="button" className="btn btn-ghost btn-xs text-graphite-400" onClick={() => removeLine(index)}>
                                        Buang
                                    </button>
                                )}
                            </div>

                            <TextField
                                label="Perkataan"
                                value={line.text}
                                maxLength={LIMITS.maxCharsPerLine}
                                placeholder={index === 0 ? 'MOHAMAD ZAID BIN ABDULLAH' : 'Guru Reka Bentuk & Teknologi'}
                                onChange={(text) => updateLine(index, { text })}
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
                                <SelectField
                                    label="Fon"
                                    value={line.font}
                                    options={FONT_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                                    onChange={(font) => updateLine(index, { font })}
                                />
                                <SelectField
                                    label="Huruf"
                                    value={line.transform}
                                    options={[
                                        { value: 'upper', label: 'HURUF BESAR' },
                                        { value: 'none', label: 'Seperti ditaip' }
                                    ]}
                                    onChange={(transform) => updateLine(index, { transform })}
                                />
                            </div>

                            <NumberField
                                label="Tinggi huruf"
                                value={line.size}
                                min={LIMITS.lineSize.min}
                                max={Math.min(LIMITS.lineSize.max, spec.height)}
                                step={0.1}
                                onChange={(size) => updateLine(index, { size })}
                            />
                            <NumberField
                                label="Jarak huruf"
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

                <Section title="Saiz plat" summary={`${spec.width} × ${spec.height} × ${spec.thickness} mm`}>
                    <NumberField label="Lebar" value={spec.width} min={LIMITS.width.min} max={LIMITS.width.max} step={0.5} onChange={(width) => update({ width })} />
                    <NumberField label="Tinggi" value={spec.height} min={LIMITS.height.min} max={LIMITS.height.max} step={0.5} onChange={(height) => update({ height })} />
                    <NumberField
                        label="Ketebalan"
                        value={spec.thickness}
                        min={LIMITS.thickness.min}
                        max={LIMITS.thickness.max}
                        step={0.1}
                        onChange={(thickness) => update({ thickness })}
                    />
                    <NumberField
                        label="Bucu bulat"
                        value={spec.cornerRadius}
                        min={LIMITS.cornerRadius.min}
                        max={Math.min(LIMITS.cornerRadius.max, Math.min(spec.width, spec.height) / 2)}
                        step={0.5}
                        onChange={(cornerRadius) => update({ cornerRadius })}
                    />
                </Section>

                <Section title="Kemasan muka" summary={spec.relief === 'emboss' ? `Timbul ${spec.reliefDepth} mm` : `Ukir ${Math.min(spec.reliefDepth, engraveLimit).toFixed(1)} mm`}>
                    <Segmented
                        label="Gaya"
                        value={spec.relief}
                        options={[
                            { value: 'emboss', label: 'Timbul' },
                            { value: 'engrave', label: 'Ukir' }
                        ]}
                        onChange={(relief: Relief) => update({ relief })}
                    />
                    <NumberField
                        label={spec.relief === 'emboss' ? 'Ketinggian teks' : 'Kedalaman ukiran'}
                        value={spec.reliefDepth}
                        min={LIMITS.reliefDepth.min}
                        max={LIMITS.reliefDepth.max}
                        step={0.1}
                        onChange={(reliefDepth) => update({ reliefDepth })}
                        hint={
                            spec.relief === 'engrave' && spec.reliefDepth > engraveLimit
                                ? `Dihadkan kepada ${engraveLimit.toFixed(1)} mm oleh poket di belakang.`
                                : spec.relief === 'emboss'
                                  ? 'Teks yang lebih tinggi lebih mudah dibaca tetapi lebih lama dicetak.'
                                  : undefined
                        }
                    />
                    <Toggle
                        label="Bingkai di tepi"
                        checked={spec.frame.enabled}
                        onChange={(enabled) => update({ frame: { ...spec.frame, enabled } })}
                        hint="Garis timbul mengelilingi plat, mengikut gaya kemasan yang sama."
                    />
                    {spec.frame.enabled && (
                        <>
                            <NumberField
                                label="Jarak dari tepi"
                                value={spec.frame.inset}
                                min={LIMITS.frameInset.min}
                                max={LIMITS.frameInset.max}
                                step={0.1}
                                onChange={(inset) => update({ frame: { ...spec.frame, inset } })}
                            />
                            <NumberField
                                label="Tebal garis"
                                value={spec.frame.width}
                                min={LIMITS.frameWidth.min}
                                max={LIMITS.frameWidth.max}
                                step={0.1}
                                onChange={(width) => update({ frame: { ...spec.frame, width } })}
                            />
                        </>
                    )}
                </Section>

                <Section title="Cara pakai" summary={mountingLabel(spec.mounting)}>
                    <Segmented
                        label="Pemasangan"
                        value={spec.mounting}
                        options={[
                            { value: 'magnet', label: 'Magnet' },
                            { value: 'pin', label: 'Peniti' },
                            { value: 'lanyard', label: 'Tali' },
                            { value: 'none', label: 'Rata' }
                        ]}
                        onChange={(mounting: Mounting) => update({ mounting })}
                    />

                    {spec.mounting === 'magnet' && (
                        <>
                            <Segmented
                                label="Bilangan magnet"
                                value={String(spec.magnet.count) as '1' | '2'}
                                options={[
                                    { value: '1', label: '1 magnet' },
                                    { value: '2', label: '2 magnet' }
                                ]}
                                onChange={(value) => update({ magnet: { ...spec.magnet, count: value === '1' ? 1 : 2 } })}
                            />
                            <NumberField
                                label="Diameter magnet"
                                value={spec.magnet.diameter}
                                min={LIMITS.magnetDiameter.min}
                                max={LIMITS.magnetDiameter.max}
                                step={0.5}
                                onChange={(diameter) => update({ magnet: { ...spec.magnet, diameter } })}
                            />
                            <NumberField
                                label="Tebal magnet"
                                value={spec.magnet.thickness}
                                min={LIMITS.magnetThickness.min}
                                max={LIMITS.magnetThickness.max}
                                step={0.5}
                                onChange={(thickness) => update({ magnet: { ...spec.magnet, thickness } })}
                                hint="Poket dipotong sedikit lebih besar supaya magnet boleh ditekan masuk."
                            />
                        </>
                    )}
                    {spec.mounting === 'pin' && <p className="text-xs text-graphite-400">Lekuk rata dipotong di belakang untuk bar peniti standard yang dilekat dengan gam.</p>}
                    {spec.mounting === 'lanyard' && <p className="text-xs text-graphite-400">Lubang memanjang di bahagian atas; teks dialih ke bawah supaya tidak bertindih.</p>}
                </Section>

                <Section title="Susun atur" summary={`${spec.align === 'center' ? 'Tengah' : 'Kiri'} · jidar ${spec.marginX} mm`}>
                    <Segmented
                        label="Penjajaran"
                        value={spec.align}
                        options={[
                            { value: 'center', label: 'Tengah' },
                            { value: 'left', label: 'Kiri' }
                        ]}
                        onChange={(align) => update({ align })}
                    />
                    <NumberField label="Jidar kiri & kanan" value={spec.marginX} min={LIMITS.marginX.min} max={LIMITS.marginX.max} step={0.5} onChange={(marginX) => update({ marginX })} />
                    <NumberField label="Jidar atas & bawah" value={spec.marginY} min={LIMITS.marginY.min} max={LIMITS.marginY.max} step={0.5} onChange={(marginY) => update({ marginY })} />
                    <NumberField label="Jarak antara baris" value={spec.lineGap} min={LIMITS.lineGap.min} max={LIMITS.lineGap.max} step={0.1} onChange={(lineGap) => update({ lineGap })} />
                </Section>
            </div>

            {/* ---------- Preview and actions ---------- */}
            <div className="space-y-5">
                <div className="panel overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div className="join">
                            <button type="button" className={`btn btn-sm join-item ${view === 'front' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('front')}>
                                Hadapan
                            </button>
                            <button type="button" className={`btn btn-sm join-item ${view === 'back' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('back')}>
                                Belakang
                            </button>
                            <button type="button" className={`btn btn-sm join-item ${view === 'plate' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('plate')}>
                                Plat
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
                            <div className="flex h-40 items-center justify-center text-sm text-graphite-400">Memuatkan bentuk huruf…</div>
                        ) : view === 'plate' ? (
                            <PlatePreview spec={spec} arrangement={arrangement} layouts={plateLayouts} bedWidth={bed.width} bedHeight={bed.height} showBed />
                        ) : (
                            <TagPreview spec={spec} layout={layout} view={view} />
                        )}
                    </div>

                    {view === 'plate' && (
                        <div className="space-y-1 border-t border-white/10 px-4 py-3 text-xs">
                            <p className="tabular text-graphite-300">
                                {arrangement.placed} unit · {arrangement.columns} lajur × {arrangement.rows} baris · jarak {arrangement.spacing} mm ·{' '}
                                {bed.label} · {bed.width} × {bed.height} mm
                            </p>
                            <p className="text-graphite-400">
                                {arrangement.fits
                                    ? `Dandang ini muat ${arrangement.capacity} tag saiz ini sekali cetak.`
                                    : 'Tag lebih besar daripada dandang.'}
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
                            {busy === 'stl' ? 'Menjana…' : licence ? 'Muat turun STL' : 'Buka kunci & muat turun STL'}
                        </button>
                        <button type="button" className="btn btn-outline border-white/20" onClick={downloadSample} disabled={busy !== null}>
                            {busy === 'sample' ? 'Menjana…' : 'STL contoh percuma'}
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
                    <h2 className="text-sm font-semibold">Lesen</h2>
                    {licence ? (
                        <div className="space-y-2 text-sm">
                            <p className="tabular break-all text-graphite-200">
                                <span className="text-graphite-400">Kunci:</span> {licence.key}
                            </p>
                            <p className="text-graphite-300">
                                {licence.unlimited
                                    ? 'Langganan bulanan aktif — STL tanpa had.'
                                    : `${licence.credits} kredit reka bentuk berbaki. Reka bentuk yang sudah dibeli boleh dimuat turun semula percuma.`}
                            </p>
                            {licence.demo && (
                                <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
                                    Lesen demo — dikeluarkan tanpa pembayaran sebenar kerana gerbang pembayaran belum dikonfigurasikan di tapak ini.
                                </p>
                            )}
                            <button type="button" className="btn btn-ghost btn-xs text-graphite-400" onClick={signOut}>
                                Log keluar lesen
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                                <input
                                    type="text"
                                    className="input input-bordered input-sm tabular min-w-0 grow bg-graphite-900/70"
                                    placeholder="KKS-XXXX-XXXX-XXXX-XXXX-XXXX"
                                    value={licenceInput}
                                    onChange={(event) => setLicenceInput(event.target.value)}
                                />
                                <button type="button" className="btn btn-sm" onClick={() => verifyLicence(licenceInput)} disabled={busy !== null}>
                                    {busy === 'licence' ? 'Menyemak…' : 'Guna kunci'}
                                </button>
                            </div>
                            {licenceError && <p className="text-xs text-error">{licenceError}</p>}
                            <p className="text-xs text-graphite-400">
                                Belum ada lesen?{' '}
                                <a href="/harga" className="underline underline-offset-4">
                                    Lihat harga
                                </a>
                                .
                            </p>
                        </div>
                    )}
                </div>

                <details className="panel" open={batchRows.length > 0}>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                        Senarai nama — seluruh staf sekali jalan
                        {batchRows.length > 0 && <span className="ml-2 text-xs font-normal text-graphite-400">{batchRows.length} nama</span>}
                        <span className="ml-2 rounded bg-brass-400/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brass-300">Langganan</span>
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
                                aria-label="Senarai nama, satu baris setiap tag"
                            />
                            <p className="text-xs text-graphite-400">Maksimum {LIMITS.maxBatchRows} tag setiap muat turun.</p>
                        </div>

                        <div className="space-y-3 border-t border-white/10 pt-4">
                            <SelectField
                                label="Dandang pencetak"
                                value={bedId}
                                options={[...BEDS.map((item) => ({ value: item.id, label: `${item.label} — ${item.width} × ${item.height} mm` })), { value: 'custom', label: 'Tersuai' }]}
                                onChange={setBedId}
                                hint="Menentukan berapa banyak tag muat pada satu kali cetak."
                            />

                            {bedId === 'custom' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <NumberField
                                        label="Lebar dandang"
                                        value={customBed.width}
                                        min={PLATE_LIMITS.bed.min}
                                        max={PLATE_LIMITS.bed.max}
                                        step={10}
                                        onChange={(width) => setCustomBed((current) => ({ ...current, width }))}
                                    />
                                    <NumberField
                                        label="Dalam dandang"
                                        value={customBed.height}
                                        min={PLATE_LIMITS.bed.min}
                                        max={PLATE_LIMITS.bed.max}
                                        step={10}
                                        onChange={(height) => setCustomBed((current) => ({ ...current, height }))}
                                    />
                                </div>
                            )}

                            <NumberField
                                label="Jarak antara tag"
                                value={spacing}
                                min={PLATE_LIMITS.spacing.min}
                                max={PLATE_LIMITS.spacing.max}
                                step={0.5}
                                onChange={setSpacing}
                                hint="Rapat memuatkan lebih banyak tag; longgar lebih senang dikeluarkan dari dandang."
                            />

                            <NumberField
                                label="Bilangan lajur"
                                value={plateColumns}
                                min={0}
                                max={PLATE_LIMITS.columns.max}
                                step={1}
                                unit={plateColumns === 0 ? 'auto' : 'lajur'}
                                onChange={(columns) => setPlateColumns(Math.round(columns))}
                                hint="Biar sifar untuk susunan paling padat."
                            />

                            <p className="tabular rounded-lg bg-graphite-900/70 px-3 py-2 text-xs text-graphite-300">
                                {arrangement.fits
                                    ? `${arrangement.columns} lajur × ${arrangement.rows} baris · ${arrangement.width.toFixed(1)} × ${arrangement.height.toFixed(1)} mm · ${arrangement.capacity} tag setiap dandang`
                                    : 'Tag lebih besar daripada dandang ini.'}{' '}
                                <button type="button" className="underline underline-offset-4" onClick={() => setView('plate')}>
                                    Lihat plat
                                </button>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                            <button type="button" className="btn btn-primary btn-sm" onClick={downloadPlate} disabled={busy !== null}>
                                {busy === 'plate' ? 'Menyusun…' : 'Muat turun satu plat'}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm border-white/20" onClick={downloadBatch} disabled={busy !== null}>
                                {busy === 'batch' ? 'Menjana…' : 'STL berasingan (ZIP)'}
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

function mountingLabel(mounting: Mounting): string {
    switch (mounting) {
        case 'magnet':
            return 'Poket magnet di belakang';
        case 'pin':
            return 'Lekuk bar peniti';
        case 'lanyard':
            return 'Lubang tali leher';
        default:
            return 'Belakang rata';
    }
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
