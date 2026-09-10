import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { translate } from '../../i18n/ui';
import { createHash } from 'node:crypto';
import { isFontId } from './fonts';
import { DEFAULT_BED, PLATE_LIMITS } from './plate';
import type { PlateOptions } from './plate';
import { DEFAULT_PRESET, LIMITS, findPreset } from './presets';
import type { Align, FontId, Mounting, NametagSpec, Relief, TagLine, TextTransform } from './types';

export class SpecError extends Error {}

function clamp(value: unknown, range: { min: number; max: number }, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(range.max, Math.max(range.min, Math.round(n * 100) / 100));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function cleanText(value: unknown): string {
    if (typeof value !== 'string') return '';
    // Strip control characters, collapse whitespace, and cap the length.
    return value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, LIMITS.maxCharsPerLine);
}

function parseLine(input: unknown, fallback: TagLine): TagLine {
    const raw = (input ?? {}) as Record<string, unknown>;
    return {
        text: cleanText(raw.text),
        font: (isFontId(raw.font) ? raw.font : fallback.font) as FontId,
        size: clamp(raw.size, LIMITS.lineSize, fallback.size),
        tracking: clamp(raw.tracking, LIMITS.tracking, fallback.tracking),
        transform: pick<TextTransform>(raw.transform, ['none', 'upper'], fallback.transform)
    };
}

/**
 * Turns whatever arrived over the wire into a spec that is safe to build geometry from.
 * Every number is clamped rather than rejected, so a slightly out-of-range value from an
 * older client still produces a usable tag instead of an error page.
 */
export function parseSpec(input: unknown, lang: Lang = DEFAULT_LANG): NametagSpec {
    if (typeof input !== 'object' || input === null) throw new SpecError(translate(lang, 'api.spec.invalid'));
    const raw = input as Record<string, unknown>;

    const preset = findPreset(typeof raw.preset === 'string' ? raw.preset : '') ?? DEFAULT_PRESET;
    const defaults = preset.spec;
    const lineFallback = defaults.lines[0] ?? DEFAULT_PRESET.spec.lines[0];

    const rawLines = Array.isArray(raw.lines) ? raw.lines.slice(0, LIMITS.maxLines) : [];
    const lines = rawLines.map((line, i) => parseLine(line, defaults.lines[i] ?? lineFallback));
    const filled = lines.filter((line) => line.text !== '');
    if (filled.length === 0) throw new SpecError(translate(lang, 'api.spec.needLine'));

    const frameRaw = (raw.frame ?? {}) as Record<string, unknown>;
    const magnetRaw = (raw.magnet ?? {}) as Record<string, unknown>;

    const spec: NametagSpec = {
        preset: preset.id,
        width: clamp(raw.width, LIMITS.width, defaults.width),
        height: clamp(raw.height, LIMITS.height, defaults.height),
        thickness: clamp(raw.thickness, LIMITS.thickness, defaults.thickness),
        cornerRadius: clamp(raw.cornerRadius, LIMITS.cornerRadius, defaults.cornerRadius),
        relief: pick<Relief>(raw.relief, ['emboss', 'engrave'], defaults.relief),
        reliefDepth: clamp(raw.reliefDepth, LIMITS.reliefDepth, defaults.reliefDepth),
        align: pick<Align>(raw.align, ['center', 'left'], defaults.align),
        marginX: clamp(raw.marginX, LIMITS.marginX, defaults.marginX),
        marginY: clamp(raw.marginY, LIMITS.marginY, defaults.marginY),
        lineGap: clamp(raw.lineGap, LIMITS.lineGap, defaults.lineGap),
        frame: {
            enabled: typeof frameRaw.enabled === 'boolean' ? frameRaw.enabled : defaults.frame.enabled,
            inset: clamp(frameRaw.inset, LIMITS.frameInset, defaults.frame.inset),
            width: clamp(frameRaw.width, LIMITS.frameWidth, defaults.frame.width)
        },
        mounting: pick<Mounting>(raw.mounting, ['none', 'magnet', 'pin', 'lanyard'], defaults.mounting),
        magnet: {
            diameter: clamp(magnetRaw.diameter, LIMITS.magnetDiameter, defaults.magnet.diameter),
            thickness: clamp(magnetRaw.thickness, LIMITS.magnetThickness, defaults.magnet.thickness),
            count: magnetRaw.count === 1 ? 1 : 2
        },
        lines: filled
    };

    // A corner radius cannot exceed half of the shorter side.
    spec.cornerRadius = Math.min(spec.cornerRadius, spec.width / 2, spec.height / 2);
    // Margins have to leave somewhere for the text to go.
    spec.marginX = Math.min(spec.marginX, spec.width / 2 - 2);
    spec.marginY = Math.min(spec.marginY, spec.height / 2 - 1);

    return spec;
}

/**
 * Stable fingerprint of a design. Re-downloading the same tag must not cost another credit,
 * so the key has to depend only on what ends up in the STL - not on key order or formatting.
 */
export function specHash(spec: NametagSpec): string {
    return createHash('sha256').update(canonical(spec)).digest('hex').slice(0, 32);
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    }
    if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
    return JSON.stringify(value ?? null);
}

/** A filename that is safe on Windows, macOS and Linux. */
export function suggestedFilename(spec: NametagSpec, extension = 'stl'): string {
    const name = spec.lines[0]?.text ?? 'nametag';
    const slug =
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'nametag';
    return `kakas-${slug}-${spec.width}x${spec.height}mm.${extension}`;
}

export interface ParsedRow {
    /** Position in the submitted list, so a skipped row does not renumber the rest. */
    index: number;
    spec: NametagSpec;
}

/**
 * Turns a list of rows into tag specs, each row replacing the text of the base design's lines.
 *
 * Lines a row leaves empty are dropped by parseSpec, so a two-field row on a three-line design
 * simply produces a two-line tag. A row that cannot make a valid tag is reported and skipped
 * rather than failing the whole list - one typo should not cost someone their other 59 tags.
 */
export function specsFromRows(base: NametagSpec, rows: unknown[], lang: Lang = DEFAULT_LANG): { rows: ParsedRow[]; problems: string[] } {
    const parsed: ParsedRow[] = [];
    const problems: string[] = [];

    for (const [index, row] of rows.entries()) {
        const fields = (Array.isArray(row) ? row : [row]).map((field) => String(field ?? '').trim());
        try {
            parsed.push({
                index,
                spec: parseSpec({ ...base, lines: base.lines.map((line, i) => ({ ...line, text: fields[i] ?? '' })) }, lang)
            });
        } catch (error) {
            problems.push(translate(lang, 'api.row.problem', { row: index + 1, message: (error as Error).message }));
        }
    }

    return { rows: parsed, problems };
}

/** Reads the bed and spacing settings for plate mode, clamping everything to sane limits. */
export function parsePlateOptions(input: unknown): PlateOptions {
    const raw = (input ?? {}) as Record<string, unknown>;
    const columns = Number(raw.columns);

    return {
        bedWidth: clamp(raw.bedWidth, PLATE_LIMITS.bed, DEFAULT_BED.width),
        bedHeight: clamp(raw.bedHeight, PLATE_LIMITS.bed, DEFAULT_BED.height),
        spacing: clamp(raw.spacing, PLATE_LIMITS.spacing, 5),
        margin: clamp(raw.margin, PLATE_LIMITS.margin, 5),
        // Zero means "pick for me", which is the default the studio sends.
        columns: Number.isFinite(columns) && columns > 0 ? Math.min(Math.floor(columns), PLATE_LIMITS.columns.max) : undefined
    };
}
