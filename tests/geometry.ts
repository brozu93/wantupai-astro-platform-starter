/**
 * The test suite that matters for this product.
 *
 * The generator's whole job is to hand someone a file their slicer will accept, so the check
 * that counts is not "did the function return" but "is the surface closed". Every preset, a set
 * of awkward text and mounting combinations, and several multi-tag plates are built and verified
 * to be watertight solids with outward normals. Sample STLs are written out so a failure can be
 * opened and looked at rather than guessed about.
 *
 *   npm test
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mesh } from '../src/lib/nametag/geometry/mesh';
import { loadFonts } from '../src/lib/nametag/fonts';
import { fontIdsUsed, layoutTag } from '../src/lib/nametag/layout';
import { buildNametag } from '../src/lib/nametag/model';
import { arrangePlate } from '../src/lib/nametag/plate';
import type { PlateOptions } from '../src/lib/nametag/plate';
import { PRESETS } from '../src/lib/nametag/presets';
import type { NametagSpec } from '../src/lib/nametag/types';

const outDir = process.env.STL_OUT ?? '.stl-samples';

interface Report {
    triangles: number;
    openEdges: number;
    duplicateEdges: number;
    degenerate: number;
    bounds: string;
    volume: number;
}

function key(x: number, y: number, z: number): string {
    // Vertices are produced from shared arrays, so rounding only guards against -0.
    return `${Math.round(x * 1e6) / 1e6},${Math.round(y * 1e6) / 1e6},${Math.round(z * 1e6) / 1e6}`;
}

function inspect(mesh: Mesh): Report {
    const data = mesh.triangles();
    const directed = new Map<string, number>();
    let degenerate = 0;

    for (let i = 0; i < data.length; i += 9) {
        const a = key(data[i], data[i + 1], data[i + 2]);
        const b = key(data[i + 3], data[i + 4], data[i + 5]);
        const c = key(data[i + 6], data[i + 7], data[i + 8]);
        if (a === b || b === c || a === c) {
            degenerate++;
            continue;
        }
        for (const [from, to] of [
            [a, b],
            [b, c],
            [c, a]
        ]) {
            const edge = `${from}|${to}`;
            directed.set(edge, (directed.get(edge) ?? 0) + 1);
        }
    }

    let openEdges = 0;
    let duplicateEdges = 0;
    for (const [edge, count] of directed) {
        if (count > 1) duplicateEdges += count - 1;
        const [from, to] = edge.split('|');
        const opposite = directed.get(`${to}|${from}`) ?? 0;
        if (opposite !== count) openEdges++;
    }

    // Divergence theorem: a closed mesh with outward normals has positive volume.
    let volume = 0;
    for (let i = 0; i < data.length; i += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = data.slice(i, i + 9);
        volume += (ax * (by * cz - cy * bz) - ay * (bx * cz - cx * bz) + az * (bx * cy - cx * by)) / 6;
    }

    const { min, max } = mesh.bounds();
    const bounds = `${(max[0] - min[0]).toFixed(2)} × ${(max[1] - min[1]).toFixed(2)} × ${(max[2] - min[2]).toFixed(2)} mm`;
    return { triangles: mesh.triangleCount, openEdges, duplicateEdges, degenerate, bounds, volume };
}

async function run(name: string, spec: NametagSpec): Promise<boolean> {
    const fonts = await loadFonts(fontIdsUsed(spec));
    const layout = layoutTag(spec, fonts);
    const { mesh, notes } = buildNametag(spec, layout);
    const report = inspect(mesh);

    // A watertight solid: no unpaired edges, no repeated edges, and normals facing out.
    const ok = report.openEdges === 0 && report.duplicateEdges === 0 && report.volume > 0 && mesh.stats.incompleteFaces === 0;
    const status = ok ? 'PASS' : 'FAIL';
    console.log(
        `${status}  ${name.padEnd(26)} ${String(report.triangles).padStart(6)} tri  ${report.bounds.padEnd(24)}` +
            ` open=${report.openEdges} dup=${report.duplicateEdges} vol=${report.volume.toFixed(0)}mm³` +
            ` incomplete=${mesh.stats.incompleteFaces}`
    );
    if (layout.warnings.length) console.log(`      layout: ${layout.warnings.join(' | ')}`);
    if (notes.length && process.env.VERBOSE) console.log(`      notes: ${notes.join(' | ')}`);

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${name}.stl`), mesh.toSTL(`KAKAS ${name}`));
    return ok;
}

/**
 * Plate mode assembles many tags into one file. Each tag is closed on its own, so the plate is
 * a set of disjoint closed surfaces - which the same edge pairing and volume checks cover. The
 * case that would break it is tags packed tight enough for two walls to land on identical
 * vertices, which shows up here as repeated edges.
 */
async function runPlate(name: string, spec: NametagSpec, names: string[], options: PlateOptions): Promise<boolean> {
    const fonts = await loadFonts(fontIdsUsed(spec));
    const arrangement = arrangePlate(spec.width, spec.height, names.length, options);
    const plate = new Mesh();

    for (const slot of arrangement.slots) {
        const rowSpec: NametagSpec = { ...spec, lines: spec.lines.map((line, i) => (i === 0 ? { ...line, text: names[slot.index] } : line)) };
        const { mesh } = buildNametag(rowSpec, layoutTag(rowSpec, fonts));
        plate.appendTranslated(mesh, slot.cx, slot.cy);
    }

    const report = inspect(plate);
    const ok = report.openEdges === 0 && report.duplicateEdges === 0 && report.volume > 0 && plate.stats.incompleteFaces === 0;
    console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} ${String(report.triangles).padStart(6)} tri  ${report.bounds.padEnd(24)}` +
            ` open=${report.openEdges} dup=${report.duplicateEdges} vol=${report.volume.toFixed(0)}mm³` +
            ` incomplete=${plate.stats.incompleteFaces}`
    );
    console.log(`      susunan: ${arrangement.columns} lajur × ${arrangement.rows} baris, ${arrangement.placed}/${names.length} tag, jarak ${arrangement.spacing} mm`);

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${name}.stl`), plate.toSTL(`KAKAS ${name}`));
    return ok;
}

const ROSTER = [
    'MUNIROH', 'NOLIYATI', 'NORMA', 'SA\'ADAH', 'KHAIRUNNISA\'', 'DANIAL', 'ROHAYATI', 'MUHAMAD',
    'NORASIKIN', 'NORASIKIN', 'ZUNAIDA', 'ROHANA', 'RUHANI', 'ZUNIDAH', 'AISYAH', 'FARIDAH'
];

const cases: Array<[string, NametagSpec]> = PRESETS.map((preset) => [preset.id, preset.spec]);

const guru = PRESETS[0].spec;
cases.push(['guru-engrave', { ...guru, relief: 'engrave', reliefDepth: 0.6 }]);
cases.push(['guru-frame', { ...guru, frame: { enabled: true, inset: 1.5, width: 0.8 } }]);
cases.push(['guru-pin', { ...guru, mounting: 'pin' }]);
cases.push(['guru-lanyard', { ...guru, mounting: 'lanyard' }]);
cases.push(['guru-no-mount', { ...guru, mounting: 'none' }]);
cases.push(['guru-sharp', { ...guru, cornerRadius: 0 }]);
cases.push(['guru-one-magnet', { ...guru, magnet: { diameter: 10, thickness: 3, count: 1 } }]);
cases.push([
    'long-name',
    {
        ...guru,
        lines: [
            { text: 'Dr. Siti Nurhaliza binti Tarudin Abdullah', font: 'sans-bold', size: 5, tracking: 0.1, transform: 'upper' },
            { text: 'Pegawai Perkhidmatan Pendidikan Gred DG41', font: 'narrow-regular', size: 3.2, tracking: 0, transform: 'none' }
        ]
    }
]);
cases.push([
    'descenders',
    {
        ...guru,
        lines: [
            { text: 'jgpqy JGPQY @&()', font: 'sans-bold', size: 5, tracking: 0.1, transform: 'none' },
            { text: 'Ágnes Öztürk-Çelik', font: 'sans-regular', size: 3.2, tracking: 0, transform: 'none' }
        ]
    }
]);
cases.push([
    'engrave-deep',
    { ...guru, relief: 'engrave', reliefDepth: 2.5, thickness: 2, frame: { enabled: true, inset: 1.5, width: 0.8 } }
]);
cases.push([
    'four-lines',
    {
        ...guru,
        height: 32,
        lines: [
            { text: 'SEKOLAH KEBANGSAAN SERI AMAN', font: 'narrow-bold', size: 3, tracking: 0.1, transform: 'upper' },
            { text: 'MOHAMAD ZAID', font: 'sans-bold', size: 5, tracking: 0.1, transform: 'upper' },
            { text: 'Guru Reka Bentuk & Teknologi', font: 'sans-regular', size: 3, tracking: 0, transform: 'none' },
            { text: 'GB 1234', font: 'sans-regular', size: 2.6, tracking: 0.4, transform: 'upper' }
        ]
    }
]);

const plateCases: Array<[string, NametagSpec, string[], PlateOptions]> = [
    // The reference arrangement: sixteen 76 x 25 tags land on 2 columns x 8 rows.
    ['plate-16-bambu', guru, ROSTER, { bedWidth: 256, bedHeight: 256, spacing: 5, margin: 5 }],
    // A full Voron Trident 350 bed, which is where the roster actually gets printed.
    ['plate-voron-full', guru, ROSTER, { bedWidth: 350, bedHeight: 350, spacing: 5, margin: 5 }],
    // Sharp corners asking for zero spacing - the case that puts two walls on the same
    // vertices. arrangePlate clamps to MIN_SPACING, and this fails loudly if that ever stops.
    ['plate-tight', { ...guru, cornerRadius: 0 }, ROSTER.slice(0, 6), { bedWidth: 350, bedHeight: 350, spacing: 0, margin: 5 }],
    // More names than the bed holds: the arrangement must place what fits and no more.
    ['plate-overflow', guru, ROSTER, { bedWidth: 220, bedHeight: 220, spacing: 5, margin: 5 }],
    // A forced single column, plus engraved text and a lanyard slot through the plate.
    ['plate-column', { ...guru, relief: 'engrave', mounting: 'lanyard' }, ROSTER.slice(0, 5), { bedWidth: 220, bedHeight: 220, spacing: 4, margin: 5, columns: 1 }]
];

let failures = 0;
for (const [name, spec] of cases) {
    if (!(await run(name, spec))) failures++;
}
for (const [name, spec, names, options] of plateCases) {
    if (!(await runPlate(name, spec, names, options))) failures++;
}

const total = cases.length + plateCases.length;
console.log(`\n${total - failures}/${total} kes lulus. Fail STL: ${outDir}/`);
if (failures > 0) process.exit(1);
