import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { translate } from '../../i18n/ui';
import { flattenPath } from './geometry/path';
import type { Ring } from './geometry/path';
import { Mesh } from './geometry/mesh';
import { mergeOverlapping } from './geometry/merge';
import type { Polygon } from './geometry/polygon';
import { circle, nestRings, orient, roundedRect, slot } from './geometry/polygon';
import { MIN_BACK_WALL, maxEngraveDepth, mountingLayout } from './mounting';
import type { NametagSpec, TagLayout } from './types';

/** Curve flattening target in mm, well under what a nozzle or a laser can resolve. */
const CHORD_TOLERANCE = 0.04;

export interface BuildResult {
    mesh: Mesh;
    /** Print advice worth passing on to whoever slices this. */
    notes: string[];
}

/** Converts the positioned glyphs of a layout into millimetre polygons. */
export function textPolygons(layout: TagLayout): Polygon[] {
    const polygons: Polygon[] = [];
    for (const line of layout.lines) {
        for (const glyph of line.glyphs) {
            if (!glyph.path) continue;
            const tolerance = CHORD_TOLERANCE / glyph.scale;
            const rings = flattenPath(glyph.path, tolerance).map((ring) =>
                ring.map(([x, y]) => [glyph.x + x * glyph.scale, glyph.y + y * glyph.scale] as [number, number])
            );
            // Nesting per glyph keeps each letter's counters attached to that letter.
            polygons.push(...nestRings(rings));
        }
    }
    return polygons;
}

/** The raised or recessed border, as a single ring-shaped polygon. */
export function framePolygon(spec: NametagSpec): Polygon | null {
    if (!spec.frame.enabled) return null;
    const { inset, width } = spec.frame;
    const outerW = spec.width - inset * 2;
    const outerH = spec.height - inset * 2;
    const innerW = outerW - width * 2;
    const innerH = outerH - width * 2;
    if (innerW <= 0.5 || innerH <= 0.5) return null;

    return {
        outer: orient(roundedRect(0, 0, outerW, outerH, Math.max(0, spec.cornerRadius - inset)), true),
        holes: [orient(roundedRect(0, 0, innerW, innerH, Math.max(0, spec.cornerRadius - inset - width)), false)]
    };
}

/**
 * Builds the printable solid.
 *
 * The plate lies flat with its back on Z = 0 and its face at Z = thickness, which is the
 * orientation it should be sliced in. Embossed detail rises above the face; engraved detail is
 * cut into it. Text and frame are stitched into the face rather than dropped on top of it, so
 * the result is one closed surface instead of a pile of overlapping solids.
 */
export function buildNametag(spec: NametagSpec, layout: TagLayout, lang: Lang = DEFAULT_LANG): BuildResult {
    const mesh = new Mesh();
    const notes: string[] = [];

    const thickness = spec.thickness;
    const face = thickness;
    const plateOuter = orient(roundedRect(0, 0, spec.width, spec.height, spec.cornerRadius, 16), true);
    const mounting = mountingLayout(spec);

    const through: Ring[] = mounting.lanyard
        ? [orient(slot(mounting.lanyard.cx, mounting.lanyard.cy, mounting.lanyard.length, mounting.lanyard.width), false)]
        : [];

    const pockets: Array<{ ring: Ring; depth: number }> = [
        ...mounting.magnets.map((magnet) => ({ ring: orient(circle(magnet.cx, magnet.cy, magnet.radius), false), depth: magnet.depth })),
        ...(mounting.pin ? [{ ring: orient(roundedRect(0, 0, mounting.pin.length, mounting.pin.width, mounting.pin.corner), false), depth: mounting.pin.depth }] : [])
    ];

    const rawRelief: Polygon[] = textPolygons(layout);
    const frame = framePolygon(spec);
    if (frame) rawRelief.push(frame);
    const relief = mergeOverlapping(rawRelief).shapes;

    const limit = maxEngraveDepth(spec, mounting);
    const depth = spec.relief === 'engrave' ? Math.min(spec.reliefDepth, limit) : spec.reliefDepth;
    if (spec.relief === 'engrave' && depth < spec.reliefDepth) {
        notes.push(translate(lang, 'note.engraveLimited', { depth: depth.toFixed(1) }));
    }

    // --- Face at Z = thickness -------------------------------------------------------
    // Everything meeting the face is nested in one pass rather than assumed to be a flat list
    // of siblings: a frame contains the text, a letter contains its own counter, and a counter
    // could contain something again. Nesting by containment gets all of those right and hands
    // back the plate surface as regions ready to triangulate.
    const faceRings: Ring[] = [plateOuter, ...through];
    for (const shape of relief) faceRings.push(shape.outer, ...shape.holes);
    for (const region of nestRings(faceRings)) mesh.addFace(region, face, true);

    for (const shape of relief) {
        const outer = shape.outer;
        const counters = shape.holes;
        if (spec.relief === 'emboss') {
            mesh.addWalls(orient(outer, true), face, face + depth);
            for (const counter of counters) mesh.addWalls(orient(counter, false), face, face + depth);
            mesh.addFace({ outer: orient(outer, true), holes: counters.map((c) => orient(c, false)) }, face + depth, true);
        } else {
            // Engraving inverts the windings: the letter is now a void, so its walls face inwards.
            mesh.addWalls(orient(outer, false), face - depth, face);
            for (const counter of counters) mesh.addWalls(orient(counter, true), face - depth, face);
            mesh.addFace({ outer: orient(outer, true), holes: counters.map((c) => orient(c, false)) }, face - depth, true);
        }
    }

    // --- Back at Z = 0 ---------------------------------------------------------------
    mesh.addFace({ outer: plateOuter, holes: [...through, ...pockets.map((pocket) => pocket.ring)] }, 0, false);
    for (const pocket of pockets) {
        mesh.addWalls(pocket.ring, 0, pocket.depth);
        mesh.addFace({ outer: orient(pocket.ring, true), holes: [] }, pocket.depth, false);
    }

    // --- Sides -----------------------------------------------------------------------
    mesh.addWalls(plateOuter, 0, face);
    for (const hole of through) mesh.addWalls(hole, 0, face);

    if (spec.relief === 'emboss') {
        notes.push(translate(lang, 'note.twoColour', { height: thickness.toFixed(1) }));
    }
    if (mounting.magnets.length > 0) {
        const magnet = mounting.magnets[0];
        notes.push(
            translate(lang, 'note.magnetPocket', {
                pocket: (magnet.radius * 2).toFixed(1),
                depth: magnet.depth.toFixed(1),
                diameter: spec.magnet.diameter,
                thickness: spec.magnet.thickness
            })
        );
    }
    if (mounting.pin) {
        notes.push(translate(lang, 'note.pinRecess', { length: mounting.pin.length.toFixed(0), width: mounting.pin.width, depth: mounting.pin.depth }));
    }
    if (spec.mounting === 'magnet' && mounting.magnets.length === 0) {
        notes.push(translate(lang, 'note.magnetTooBig'));
    }
    if (thickness - mounting.deepestPocket < MIN_BACK_WALL + 0.2) {
        notes.push(translate(lang, 'note.thinBackWall'));
    }

    return { mesh, notes };
}
