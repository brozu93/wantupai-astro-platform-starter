import type { FontData, FontId } from '../types';
import { FONT_IDS } from '../types';

export interface FontOption {
    id: FontId;
}

export const FONT_OPTIONS: FontOption[] = [
    { id: 'sans-bold' },
    { id: 'sans-medium' },
    { id: 'sans-regular' },
    { id: 'narrow-bold' },
    { id: 'narrow-regular' }
];

const cache = new Map<FontId, FontData>();

export function isFontId(value: unknown): value is FontId {
    return typeof value === 'string' && (FONT_IDS as readonly string[]).includes(value);
}

/**
 * Loads glyph data for a font. The JSON files are split into their own chunks so the
 * browser only downloads the weights actually used by the current design.
 */
export async function loadFont(id: FontId): Promise<FontData> {
    const cached = cache.get(id);
    if (cached) return cached;

    let mod: { default: unknown };
    switch (id) {
        case 'sans-bold':
            mod = await import('./sans-bold.json');
            break;
        case 'sans-medium':
            mod = await import('./sans-medium.json');
            break;
        case 'sans-regular':
            mod = await import('./sans-regular.json');
            break;
        case 'narrow-bold':
            mod = await import('./narrow-bold.json');
            break;
        case 'narrow-regular':
            mod = await import('./narrow-regular.json');
            break;
        default:
            throw new Error(`Fon tidak dikenali: ${String(id)}`);
    }

    const data = mod.default as FontData;
    cache.set(id, data);
    return data;
}

/** Loads every font referenced by a set of lines, in parallel. */
export async function loadFonts(ids: Iterable<FontId>): Promise<Map<FontId, FontData>> {
    const unique = [...new Set(ids)];
    const loaded = await Promise.all(unique.map(loadFont));
    return new Map(unique.map((id, i) => [id, loaded[i]]));
}
