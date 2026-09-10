import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { translate } from '../../i18n/ui';
import { LANYARD_ZONE } from './mounting';
import { LIMITS } from './presets';
import { applyTransform, inkAbove, inkBelow, measureLine, sanitiseForFont } from './text';
import type { FontData, FontId, LineLayout, NametagSpec, TagLayout } from './types';

/** Gap kept between the text block and a raised frame, in mm. */
const FRAME_CLEARANCE = 1;

export function fontIdsUsed(spec: NametagSpec): FontId[] {
    return [...new Set(spec.lines.filter((line) => line.text.trim() !== '').map((line) => line.font))];
}

/**
 * Usable text area in mm, after margins, any frame and the lanyard slot. `centreY` is the
 * middle of that area relative to the middle of the plate, so text shifts down to clear
 * a lanyard slot instead of running into it.
 */
export function textArea(spec: NametagSpec): { width: number; height: number; centreY: number } {
    const frameInset = spec.frame.enabled ? spec.frame.inset + spec.frame.width + FRAME_CLEARANCE : 0;
    const marginX = Math.max(spec.marginX, frameInset);
    const marginY = Math.max(spec.marginY, frameInset);
    const topReserve = spec.mounting === 'lanyard' ? LANYARD_ZONE : 0;
    return {
        width: Math.max(1, spec.width - marginX * 2),
        height: Math.max(1, spec.height - marginY * 2 - topReserve),
        centreY: -topReserve / 2
    };
}

/**
 * Positions every glyph of every line. The result drives both the on-screen preview and
 * the STL builder, so what the customer sees is what gets printed.
 *
 * Coordinates are millimetres with the origin at the centre of the plate and Y pointing up.
 */
export function layoutTag(spec: NametagSpec, fonts: Map<FontId, FontData>, lang: Lang = DEFAULT_LANG): TagLayout {
    const warnings: string[] = [];
    const area = textArea(spec);

    const entries = spec.lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.text.trim() !== '')
        .slice(0, LIMITS.maxLines);

    // First pass: fit each line horizontally on its own.
    const measured = entries.map(({ line, index }) => {
        const font = fonts.get(line.font);
        if (!font) throw new Error(`Data fon "${line.font}" belum dimuatkan`);

        const text = sanitiseForFont(applyTransform(line.text, line.transform), font);
        let size = Math.min(Math.max(line.size, LIMITS.lineSize.min), LIMITS.lineSize.max);
        let unitScale = size / font.capHeight;
        let run = measureLine(font, text, line.tracking / unitScale);
        let naturalWidth = run.width * unitScale;
        let shrunk = false;

        if (naturalWidth > area.width && naturalWidth > 0) {
            size = Math.max(LIMITS.lineSize.min, size * (area.width / naturalWidth));
            unitScale = size / font.capHeight;
            run = measureLine(font, text, line.tracking / unitScale);
            naturalWidth = run.width * unitScale;
            shrunk = true;
        }

        return { font, text, size, requested: line.size, unitScale, run, width: naturalWidth, shrunk, index };
    });

    // Second pass: fit the stack of lines vertically, shrinking everything together so the
    // relative sizes the customer chose are preserved.
    const stackHeight = (scale: number) =>
        measured.reduce((total, m) => total + (inkAbove(m.font, m.text) + inkBelow(m.font, m.text)) * m.size * scale, 0) +
        Math.max(0, measured.length - 1) * spec.lineGap;

    let verticalScale = 1;
    const natural = stackHeight(1);
    if (natural > area.height && natural > 0) {
        const gaps = Math.max(0, measured.length - 1) * spec.lineGap;
        const ink = natural - gaps;
        verticalScale = ink > 0 ? Math.max(0.35, (area.height - gaps) / ink) : 1;
        warnings.push(translate(lang, 'warn.verticalShrink'));
    }

    const total = stackHeight(verticalScale);
    let cursor = area.centreY + total / 2;

    const lines: LineLayout[] = measured.map((m) => {
        const size = m.size * verticalScale;
        const unitScale = size / m.font.capHeight;
        const above = inkAbove(m.font, m.text) * size;
        const below = inkBelow(m.font, m.text) * size;
        const baseline = cursor - above;
        cursor = baseline - below - spec.lineGap;

        const width = m.width * verticalScale;
        const left = spec.align === 'center' ? -width / 2 : -area.width / 2;

        if (m.shrunk) {
            const label = `${m.text.slice(0, 24)}${m.text.length > 24 ? '…' : ''}`;
            // Shrinking a long name past a certain point makes it smaller than the job title
            // below it. Switching to a narrow weight keeps the hierarchy and reads better.
            const severe = size < m.requested * 0.85 && !m.font.id.startsWith('narrow');
            warnings.push(
                severe
                    ? translate(lang, 'warn.lineShrunkHard', { label })
                    : translate(lang, 'warn.lineShrunkSlight', { label })
            );
        }

        return {
            text: m.text,
            font: m.font.id,
            baseline,
            left,
            width,
            capHeight: size,
            size,
            shrunk: m.shrunk || verticalScale < 1,
            glyphs: m.run.glyphs.map((glyph) => ({
                char: glyph.char,
                x: left + glyph.offset * unitScale,
                y: baseline,
                scale: unitScale,
                path: glyph.path
            }))
        };
    });

    return { width: spec.width, height: spec.height, lines, warnings: [...new Set(warnings)] };
}
