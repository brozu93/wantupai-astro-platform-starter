/** Shared vocabulary for the nametag generator. Used by the browser preview and the STL builder. */

export const FONT_IDS = ['sans-bold', 'sans-medium', 'sans-regular', 'narrow-bold', 'narrow-regular'] as const;
export type FontId = (typeof FONT_IDS)[number];

/** Compact glyph data produced by scripts/build-font-data.mjs. */
export interface FontData {
    id: FontId;
    label: string;
    family: string;
    /** Font design units per em; all glyph coordinates are in these units. */
    upem: number;
    ascender: number;
    descender: number;
    capHeight: number;
    xHeight: number;
    /** char -> [advanceWidth, pathData] */
    glyphs: Record<string, [number, string]>;
    /** Two-character key (left + right) -> kerning adjustment in font units. */
    kern: Record<string, number>;
}

export type TextTransform = 'none' | 'upper';
export type Relief = 'emboss' | 'engrave';
export type Align = 'center' | 'left';

/** How the finished tag attaches to a uniform or baju korporat. */
export type Mounting = 'none' | 'magnet' | 'pin' | 'lanyard';

export interface TagLine {
    text: string;
    font: FontId;
    /** Cap height in mm - the height of an uppercase letter, which is what people actually measure. */
    size: number;
    /** Extra letter spacing in mm. */
    tracking: number;
    transform: TextTransform;
}

export interface FrameSpec {
    enabled: boolean;
    /** Distance from the plate edge to the outside of the frame, in mm. */
    inset: number;
    /** Frame line width in mm. */
    width: number;
}

export interface MagnetSpec {
    /** Magnet diameter in mm; the pocket is cut slightly larger. */
    diameter: number;
    /** Magnet thickness in mm; the pocket is cut slightly deeper. */
    thickness: number;
    count: 1 | 2;
}

export interface NametagSpec {
    preset: string;
    /** Plate size in mm. */
    width: number;
    height: number;
    thickness: number;
    cornerRadius: number;
    relief: Relief;
    /** Emboss height or engrave depth in mm. */
    reliefDepth: number;
    align: Align;
    /** Horizontal padding kept clear of text, in mm. */
    marginX: number;
    /** Vertical padding kept clear of text, in mm. */
    marginY: number;
    /** Vertical gap between text lines, in mm. */
    lineGap: number;
    frame: FrameSpec;
    mounting: Mounting;
    magnet: MagnetSpec;
    lines: TagLine[];
}

/** A single positioned glyph. Coordinates are mm, origin at the plate centre, Y up. */
export interface GlyphPlacement {
    char: string;
    /** Pen origin of the glyph, in mm. */
    x: number;
    y: number;
    /** Multiplier converting font units to mm. */
    scale: number;
    /** Outline path data in font units, Y up. */
    path: string;
}

export interface LineLayout {
    text: string;
    font: FontId;
    /** Baseline position in mm, origin at plate centre. */
    baseline: number;
    left: number;
    width: number;
    capHeight: number;
    /** Size actually used after auto-fit shrinking, in mm. */
    size: number;
    /** True when the line had to be shrunk to fit inside the margins. */
    shrunk: boolean;
    glyphs: GlyphPlacement[];
}

export interface TagLayout {
    width: number;
    height: number;
    lines: LineLayout[];
    /** Non-fatal notes for the user, e.g. a line that had to shrink. */
    warnings: string[];
}
