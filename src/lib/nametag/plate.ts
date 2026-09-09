/**
 * Build-plate nesting.
 *
 * List mode can hand back one STL per name, but that is rarely what someone printing a whole
 * staff list actually wants: they want to load one file, press print once, and come back to a
 * tray of finished tags. This module works out where each tag sits on the bed.
 *
 * Runs on both sides. The browser uses it to draw the arrangement preview and to report how
 * many tags fit on a print; the server uses the same slots to place the meshes.
 */

export interface Bed {
    id: string;
    label: string;
    /** Usable bed size in mm. */
    width: number;
    height: number;
}

/** Common bed sizes, plus a custom entry the studio fills in from its own number fields. */
export const BEDS: Bed[] = [
    { id: 'ender3', label: 'Ender 3 / Ender 3 NG', width: 220, height: 220 },
    { id: 'bambu', label: 'Bambu A1 / P1S / X1', width: 256, height: 256 },
    { id: 'prusa', label: 'Prusa MK4 / MK3S', width: 250, height: 210 },
    { id: 'voron350', label: 'Voron Trident / 2.4 350', width: 350, height: 350 },
    { id: 'voron250', label: 'Voron Trident / 2.4 250', width: 250, height: 250 }
];

export const DEFAULT_BED = BEDS[0];

export function findBed(id: string): Bed | undefined {
    return BEDS.find((bed) => bed.id === id);
}

export interface PlateOptions {
    bedWidth: number;
    bedHeight: number;
    /** Gap left between neighbouring tags, in mm. */
    spacing: number;
    /** Clearance kept free around the edge of the bed, in mm. */
    margin: number;
    /** Force a column count. Left undefined, the packer picks one. */
    columns?: number;
}

export interface PlateSlot {
    /** Position in the name list, so a caller can pair a slot with its row. */
    index: number;
    column: number;
    row: number;
    /** Centre of the tag, in mm, with the arrangement centred on the origin. */
    cx: number;
    cy: number;
}

export interface Arrangement {
    columns: number;
    rows: number;
    /** Gap actually used, which may be larger than asked for - see MIN_SPACING. */
    spacing: number;
    /** How many tags this arrangement could hold on one bed. */
    capacity: number;
    /** How many of the requested tags were placed. */
    placed: number;
    /** Requested tags that did not fit and need a second print. */
    overflow: number;
    /** Bounding box of the placed tags, in mm. */
    width: number;
    height: number;
    slots: PlateSlot[];
    /** False when a single tag is already too big for the bed. */
    fits: boolean;
    notes: string[];
}

/**
 * Smallest gap allowed between tags.
 *
 * Zero is not merely a bad print setting, it is broken geometry: butt two sharp-cornered plates
 * together and their side walls land on identical vertices, which leaves the plate with repeated
 * faces no slicer should be asked to interpret. Measured at 30 duplicate edges for a 2 x 2 plate.
 * A millimetre also keeps the tags from fusing under a 0.4 mm nozzle.
 */
export const MIN_SPACING = 1;

export const PLATE_LIMITS = {
    spacing: { min: MIN_SPACING, max: 30 },
    margin: { min: 0, max: 40 },
    bed: { min: 40, max: 1000 },
    columns: { min: 1, max: 40 }
} as const;

/** How many items of `size` fit along an axis of `bed`, allowing for margins and gaps. */
function fitCount(bed: number, size: number, spacing: number, margin: number): number {
    const usable = bed - margin * 2;
    if (usable < size) return 0;
    // n items need n*size + (n-1)*spacing, which rearranges to this.
    return Math.max(0, Math.floor((usable + spacing) / (size + spacing)));
}

function span(count: number, size: number, spacing: number): number {
    return count <= 0 ? 0 : count * size + (count - 1) * spacing;
}

/**
 * Lays `count` tags out on the bed in reading order - left to right, top to bottom - so the
 * grid on screen matches the order of the pasted name list.
 *
 * With no forced column count the packer places as many tags as it can, then among the
 * arrangements that place the same number it takes the most compact bounding box. For sixteen
 * 75 x 25 mm tags at 5 mm spacing that lands on 2 columns x 8 rows, because 155 x 235 mm wastes
 * less bed than the 235 x 175 mm that three columns would need.
 */
export function arrangePlate(tagWidth: number, tagHeight: number, count: number, options: PlateOptions): Arrangement {
    const spacing = Math.max(MIN_SPACING, options.spacing);
    const margin = Math.max(0, options.margin);
    const wanted = Math.max(0, Math.floor(count));
    const notes: string[] = [];

    const maxColumns = fitCount(options.bedWidth, tagWidth, spacing, margin);
    const maxRows = fitCount(options.bedHeight, tagHeight, spacing, margin);

    if (maxColumns === 0 || maxRows === 0) {
        return {
            columns: 0,
            rows: 0,
            spacing,
            capacity: 0,
            placed: 0,
            overflow: wanted,
            width: 0,
            height: 0,
            slots: [],
            fits: false,
            notes: [`Tag ${tagWidth} × ${tagHeight} mm tidak muat pada dandang ${options.bedWidth} × ${options.bedHeight} mm dengan jidar ${margin} mm.`]
        };
    }

    let columns: number;
    if (options.columns && options.columns > 0) {
        columns = Math.min(Math.floor(options.columns), maxColumns);
        if (Math.floor(options.columns) > maxColumns) {
            notes.push(`Hanya ${maxColumns} lajur muat pada lebar dandang, jadi ${Math.floor(options.columns)} lajur dikurangkan.`);
        }
    } else {
        columns = bestColumns(wanted, maxColumns, maxRows, tagWidth, tagHeight, spacing);
    }

    const rows = Math.min(maxRows, Math.max(1, Math.ceil(wanted / columns)));
    const capacity = maxColumns * maxRows;
    const placed = Math.min(wanted, columns * rows);
    const overflow = wanted - placed;

    // The last row is usually short; size the box to what is actually placed, not to the grid.
    const usedColumns = Math.min(columns, Math.max(1, placed));
    const width = span(usedColumns, tagWidth, spacing);
    const height = span(rows, tagHeight, spacing);

    const slots: PlateSlot[] = [];
    for (let index = 0; index < placed; index++) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        slots.push({
            index,
            column,
            row,
            cx: -width / 2 + tagWidth / 2 + column * (tagWidth + spacing),
            cy: height / 2 - tagHeight / 2 - row * (tagHeight + spacing)
        });
    }

    if (overflow > 0) {
        notes.push(`${overflow} tag lagi tidak muat pada satu dandang — muat turun akan beri ${Math.ceil(wanted / Math.max(1, placed))} plat, satu fail untuk setiap kali cetak.`);
    }

    return { columns, rows, spacing, capacity, placed, overflow, width, height, slots, fits: true, notes };
}

/**
 * Picks a column count: fit the most tags, and break ties on the smallest bounding box.
 * Fewer columns wins a remaining tie, which keeps the answer stable as the list grows.
 */
function bestColumns(count: number, maxColumns: number, maxRows: number, tagWidth: number, tagHeight: number, spacing: number): number {
    if (count <= 1) return 1;

    let best = 1;
    let bestPlaced = -1;
    let bestArea = Infinity;

    for (let columns = 1; columns <= maxColumns; columns++) {
        const rows = Math.min(maxRows, Math.ceil(count / columns));
        const placed = Math.min(count, columns * rows);
        const area = span(Math.min(columns, placed), tagWidth, spacing) * span(rows, tagHeight, spacing);

        if (placed > bestPlaced || (placed === bestPlaced && area < bestArea - 1e-9)) {
            best = columns;
            bestPlaced = placed;
            bestArea = area;
        }
    }

    return best;
}
