import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { loadFonts } from './fonts';
import { Mesh } from './geometry/mesh';
import { fontIdsUsed, layoutTag } from './layout';
import { buildNametag } from './model';
import { arrangePlate } from './plate';
import type { Arrangement, PlateOptions } from './plate';
import type { FontId, NametagSpec } from './types';

export interface GeneratedTag {
    stl: Uint8Array;
    /** Print advice worth passing on, e.g. the layer to change filament at. */
    notes: string[];
    /** Things the layout had to do to make the text fit. */
    warnings: string[];
    triangles: number;
}

/** Builds the printable STL for a spec. This is the step the paywall protects. */
export async function generateTag(spec: NametagSpec, lang: Lang = DEFAULT_LANG): Promise<GeneratedTag> {
    const fonts = await loadFonts(fontIdsUsed(spec));
    const layout = layoutTag(spec, fonts, lang);
    const { mesh, notes } = buildNametag(spec, layout, lang);

    const title = spec.lines[0]?.text ?? 'nametag';
    return {
        stl: mesh.toSTL(`KAKAS ${title}`.slice(0, 79)),
        notes,
        warnings: layout.warnings,
        triangles: mesh.triangleCount
    };
}

export interface GeneratedPlate {
    stl: Uint8Array;
    /** Where each tag ended up, and how much bed the arrangement uses. */
    arrangement: Arrangement;
    /** First line of each tag, in slot order, for filenames and on-screen labels. */
    labels: string[];
    notes: string[];
    warnings: string[];
    triangles: number;
}

/**
 * Builds one STL holding every spec, laid out on the bed.
 *
 * Each distinct design is meshed once and then stamped into place, so a name repeated in the
 * list - which is how someone asks for a spare copy - costs one extra memcpy rather than a
 * second triangulation.
 */
export async function generatePlate(specs: NametagSpec[], options: PlateOptions): Promise<GeneratedPlate> {
    if (specs.length === 0) throw new Error('Tiada tag untuk disusun.');

    const fontIds = new Set<FontId>();
    for (const spec of specs) for (const id of fontIdsUsed(spec)) fontIds.add(id);
    const fonts = await loadFonts([...fontIds]);

    const lang: Lang = options.lang ?? DEFAULT_LANG;
    const arrangement = arrangePlate(specs[0].width, specs[0].height, specs.length, options);
    if (!arrangement.fits) throw new Error(arrangement.notes[0] ?? 'Tag tidak muat pada dandang.');

    const plate = new Mesh();
    const notes = new Set<string>(arrangement.notes);
    const warnings = new Set<string>();
    const labels: string[] = [];
    const cache = new Map<string, Mesh>();

    for (const slot of arrangement.slots) {
        const spec = specs[slot.index];
        labels.push(spec.lines[0]?.text ?? `tag-${slot.index + 1}`);

        const key = JSON.stringify(spec);
        let tag = cache.get(key);
        if (!tag) {
            const layout = layoutTag(spec, fonts, lang);
            const built = buildNametag(spec, layout, lang);
            for (const note of built.notes) notes.add(note);
            for (const warning of layout.warnings) warnings.add(warning);
            tag = built.mesh;
            cache.set(key, tag);
        }

        plate.appendTranslated(tag, slot.cx, slot.cy);
    }

    return {
        stl: plate.toSTL(`KAKAS plat ${arrangement.placed} tag`),
        arrangement,
        labels,
        notes: [...notes],
        warnings: [...warnings],
        triangles: plate.triangleCount
    };
}
