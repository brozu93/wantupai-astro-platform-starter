import type { FontData } from './types';

/** Characters whose outlines drop below the baseline. */
const DESCENDERS = new Set('gjpqy,;()[]{}/\\@$_QÇçÑñýÿ');
/** Characters that reach roughly cap height or above. */
const TALL = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789bdfhkltÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŠŽŒÆØß(){}[]/\\|!?"#$%&*+@');

export interface MeasuredGlyph {
    char: string;
    /** Pen advance for this glyph in font units, kerning against the previous glyph included. */
    offset: number;
    advance: number;
    path: string;
}

export interface MeasuredLine {
    glyphs: MeasuredGlyph[];
    /** Total pen advance in font units, excluding tracking. */
    width: number;
}

export function applyTransform(text: string, transform: 'none' | 'upper'): string {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    return transform === 'upper' ? trimmed.toLocaleUpperCase('ms-MY') : trimmed;
}

/** Substitutes characters the font data does not carry so a stray character never breaks a tag. */
export function sanitiseForFont(text: string, font: FontData): string {
    let out = '';
    for (const ch of text) {
        if (font.glyphs[ch]) out += ch;
        else if (font.glyphs[ch.toUpperCase()]) out += ch.toUpperCase();
        else if (ch.trim() === '') out += ' ';
        // Anything still unknown is dropped rather than rendered as a missing box.
    }
    return out;
}

/** Lays a string out along the baseline in font units. */
export function measureLine(font: FontData, text: string, trackingUnits = 0): MeasuredLine {
    const glyphs: MeasuredGlyph[] = [];
    let pen = 0;
    let previous: string | null = null;

    for (const ch of text) {
        const glyph = font.glyphs[ch];
        if (!glyph) continue;
        if (previous !== null) {
            pen += font.kern[previous + ch] ?? 0;
            pen += trackingUnits;
        }
        glyphs.push({ char: ch, offset: pen, advance: glyph[0], path: glyph[1] });
        pen += glyph[0];
        previous = ch;
    }

    return { glyphs, width: pen };
}

/** Height above the baseline that the string actually uses, as a fraction of cap height. */
export function inkAbove(font: FontData, text: string): number {
    for (const ch of text) {
        if (TALL.has(ch)) return 1;
    }
    for (const ch of text) {
        if (ch.trim() !== '') return font.xHeight / font.capHeight;
    }
    return 0;
}

/** Depth below the baseline that the string actually uses, as a fraction of cap height. */
export function inkBelow(font: FontData, text: string): number {
    for (const ch of text) {
        if (DESCENDERS.has(ch)) return Math.abs(font.descender) / font.capHeight;
    }
    return 0;
}
