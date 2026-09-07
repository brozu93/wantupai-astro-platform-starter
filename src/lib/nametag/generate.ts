import { loadFonts } from './fonts';
import { fontIdsUsed, layoutTag } from './layout';
import { buildNametag } from './model';
import type { NametagSpec } from './types';

export interface GeneratedTag {
    stl: Uint8Array;
    /** Print advice worth passing on, e.g. the layer to change filament at. */
    notes: string[];
    /** Things the layout had to do to make the text fit. */
    warnings: string[];
    triangles: number;
}

/** Builds the printable STL for a spec. This is the step the paywall protects. */
export async function generateTag(spec: NametagSpec): Promise<GeneratedTag> {
    const fonts = await loadFonts(fontIdsUsed(spec));
    const layout = layoutTag(spec, fonts);
    const { mesh, notes } = buildNametag(spec, layout);

    const title = spec.lines[0]?.text ?? 'nametag';
    return {
        stl: mesh.toSTL(`KAKAS ${title}`.slice(0, 79)),
        notes,
        warnings: layout.warnings,
        triangles: mesh.triangleCount
    };
}
