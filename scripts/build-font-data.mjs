/**
 * Extracts glyph outlines from TTF files into compact JSON used at runtime by the
 * nametag generator. Running this is a one-off authoring step: the generated JSON is
 * committed, so neither the browser nor the serverless functions need a font parser.
 *
 *   node scripts/build-font-data.mjs
 *
 * Source fonts are cached in .fonts-cache/ (gitignored) and downloaded on demand.
 * All sources are Apache-2.0 licensed - see src/lib/nametag/fonts/LICENSE-FONTS.md.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.fonts-cache');
const outDir = join(root, 'src/lib/nametag/fonts');

const ROBOTO_SRC = 'https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted';

const FONTS = [
    { id: 'sans-bold', file: 'Roboto-Bold.ttf', label: 'Sans Tebal', url: `${ROBOTO_SRC}/Roboto-Bold.ttf` },
    { id: 'sans-regular', file: 'Roboto-Regular.ttf', label: 'Sans Biasa', url: `${ROBOTO_SRC}/Roboto-Regular.ttf` },
    { id: 'sans-medium', file: 'Roboto-Medium.ttf', label: 'Sans Sederhana', url: `${ROBOTO_SRC}/Roboto-Medium.ttf` },
    { id: 'narrow-bold', file: 'RobotoCondensed-Bold.ttf', label: 'Sempit Tebal', url: `${ROBOTO_SRC}/RobotoCondensed-Bold.ttf` },
    { id: 'narrow-regular', file: 'RobotoCondensed-Regular.ttf', label: 'Sempit Biasa', url: `${ROBOTO_SRC}/RobotoCondensed-Regular.ttf` }
];

// Printable ASCII covers Malay names and job titles; the extras cover typographic
// quotes/dashes and the accented letters that turn up in names and loanwords.
const CHARSET = [
    ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)),
    ...'‘’“”–—°·€£éÉèÈêÊëËáÁàÀâÂäÄãÃíÍìÌîÎïÏóÓòÒôÔöÖõÕúÚùÙûÛüÜñÑçÇýÝÿšŠžŽåÅøØæÆœŒß'
];

function round(n) {
    // Font units are large enough that whole units are well below print resolution.
    return Math.round(n);
}

function encodePath(commands) {
    const out = [];
    for (const c of commands) {
        switch (c.type) {
            case 'M':
                out.push(`M${round(c.x)} ${round(c.y)}`);
                break;
            case 'L':
                out.push(`L${round(c.x)} ${round(c.y)}`);
                break;
            case 'Q':
                out.push(`Q${round(c.x1)} ${round(c.y1)} ${round(c.x)} ${round(c.y)}`);
                break;
            case 'C':
                out.push(`C${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} ${round(c.x)} ${round(c.y)}`);
                break;
            case 'Z':
                out.push('Z');
                break;
            default:
                throw new Error(`Unsupported path command: ${c.type}`);
        }
    }
    return out.join('');
}

async function ensureSource(font) {
    const path = join(cacheDir, font.file);
    if (existsSync(path) && statSync(path).size > 1000) return path;
    process.stdout.write(`  downloading ${font.file} ... `);
    const res = await fetch(font.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${font.url}`);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    process.stdout.write('ok\n');
    return path;
}

function familyName(parsed) {
    const names = parsed.names ?? {};
    const candidates = [names.fullName, names.fontFamily, names.windows?.fullName, names.macintosh?.fullName];
    for (const entry of candidates) {
        if (entry?.en) return entry.en;
    }
    return null;
}

function extract(font, path) {
    const parsed = opentype.parse(readFileSync(path).buffer.slice(0));
    const upem = parsed.unitsPerEm;

    const glyphs = {};
    const present = [];
    for (const ch of CHARSET) {
        const glyph = parsed.charToGlyph(ch);
        // charToGlyph falls back to .notdef (index 0) for anything missing.
        if (!glyph || (glyph.index === 0 && ch !== ' ')) continue;
        glyphs[ch] = [round(glyph.advanceWidth), encodePath(glyph.path.commands)];
        present.push({ ch, glyph });
    }

    // Kerning is flattened into a lookup table so the runtime needs no GPOS parser.
    const kern = {};
    for (const a of present) {
        for (const b of present) {
            const value = parsed.getKerningValue(a.glyph, b.glyph);
            if (value) kern[a.ch + b.ch] = round(value);
        }
    }

    const os2 = parsed.tables.os2 ?? {};
    return {
        id: font.id,
        label: font.label,
        family: familyName(parsed) ?? font.id,
        upem,
        ascender: round(parsed.ascender),
        descender: round(parsed.descender),
        capHeight: round(os2.sCapHeight || parsed.ascender * 0.72),
        xHeight: round(os2.sxHeight || parsed.ascender * 0.52),
        glyphs,
        kern
    };
}

mkdirSync(outDir, { recursive: true });
for (const font of FONTS) {
    console.log(`${font.id}:`);
    const src = await ensureSource(font);
    const data = extract(font, src);
    const target = join(outDir, `${font.id}.json`);
    writeFileSync(target, JSON.stringify(data));
    const kb = (statSync(target).size / 1024).toFixed(1);
    console.log(`  ${Object.keys(data.glyphs).length} glyphs, ${Object.keys(data.kern).length} kern pairs -> ${kb} kB`);
}
console.log('done');
