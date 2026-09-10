import type { NametagSpec } from './types';

/**
 * Where the fixings sit on the back of the plate.
 *
 * The STL builder and the on-screen back view both read this, so the pockets drawn in the
 * studio are the pockets that get cut. Dimensions are millimetres, origin at the plate centre.
 */

/** Extra clearance cut around a magnet so it presses in without splitting the plate. */
export const MAGNET_FIT = 0.3;
export const MAGNET_DEPTH_FIT = 0.2;
/** Material that must remain between any pocket and the front face. */
export const MIN_BACK_WALL = 0.6;

/** Vertical strip along the top edge reserved for a lanyard slot. */
export const LANYARD_ZONE = 6;
export const LANYARD_SLOT_LENGTH = 12;
export const LANYARD_SLOT_WIDTH = 3;

/** A standard glue-on brooch bar, recessed so it sits flush. */
export const PIN_BAR_WIDTH = 7;
export const PIN_BAR_DEPTH = 1.4;
export const PIN_BAR_CORNER = 1;

export interface MagnetPocket {
    cx: number;
    cy: number;
    /** Radius of the cut pocket, already including the fit clearance. */
    radius: number;
    depth: number;
}

export interface PinPocket {
    length: number;
    width: number;
    depth: number;
    corner: number;
}

export interface LanyardSlot {
    cx: number;
    cy: number;
    length: number;
    width: number;
}

export interface MountingLayout {
    magnets: MagnetPocket[];
    pin: PinPocket | null;
    lanyard: LanyardSlot | null;
    /** Deepest pocket cut into the back, used to limit how far the face can be engraved. */
    deepestPocket: number;
}

export function mountingLayout(spec: NametagSpec): MountingLayout {
    const maxDepth = Math.max(0, spec.thickness - MIN_BACK_WALL);
    const layout: MountingLayout = { magnets: [], pin: null, lanyard: null, deepestPocket: 0 };

    if (spec.mounting === 'magnet') {
        const radius = (spec.magnet.diameter + MAGNET_FIT) / 2;
        const depth = Math.min(spec.magnet.thickness + MAGNET_DEPTH_FIT, maxDepth);
        if (depth > 0.2 && radius * 2 + 2 < spec.height) {
            const spacing = spec.magnet.count === 2 ? Math.max(radius + 2, spec.width / 4) : 0;
            const centres = spec.magnet.count === 2 ? [-spacing, spacing] : [0];
            layout.magnets = centres.map((cx) => ({ cx, cy: 0, radius, depth }));
        }
    }

    if (spec.mounting === 'pin') {
        const length = Math.min(38, Math.max(20, spec.width * 0.45));
        const depth = Math.min(PIN_BAR_DEPTH, maxDepth);
        if (depth > 0.2 && PIN_BAR_WIDTH + 4 <= spec.height) {
            layout.pin = { length, width: PIN_BAR_WIDTH, depth, corner: PIN_BAR_CORNER };
        }
    }

    if (spec.mounting === 'lanyard') {
        layout.lanyard = {
            cx: 0,
            cy: spec.height / 2 - LANYARD_ZONE / 2,
            length: Math.min(LANYARD_SLOT_LENGTH, spec.width - 8),
            width: LANYARD_SLOT_WIDTH
        };
    }

    layout.deepestPocket = Math.max(0, ...layout.magnets.map((m) => m.depth), layout.pin?.depth ?? 0);
    return layout;
}

/** How deep the face can be engraved before it would break into a pocket. */
export function maxEngraveDepth(spec: NametagSpec, mounting = mountingLayout(spec)): number {
    return Math.max(0.2, spec.thickness - MIN_BACK_WALL - mounting.deepestPocket);
}
