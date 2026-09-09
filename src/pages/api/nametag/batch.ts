import type { APIRoute } from 'astro';
import { attachment, fail, json, readJson, toBody } from '../../../lib/api/respond';
import { isSubscriptionActive, publicLicence, readLicence, recordBatch } from '../../../lib/billing/licences';
import { generateTag } from '../../../lib/nametag/generate';
import { LIMITS } from '../../../lib/nametag/presets';
import type { NametagSpec } from '../../../lib/nametag/types';
import { SpecError, parseSpec, specHash, specsFromRows } from '../../../lib/nametag/validate';
import { createZip } from '../../../lib/nametag/zip';
import type { ZipEntry } from '../../../lib/nametag/zip';

export const prerender = false;

/**
 * Generates one tag per row and returns them as a single ZIP.
 *
 * This is the subscription feature: a school office pastes its staff list once instead of
 * running the studio dozens of times. Credits deliberately do not unlock it - a one-off
 * purchase buys one design, not a whole roster.
 */
export const POST: APIRoute = async ({ request }) => {
    let body: { licenceKey?: string; spec?: unknown; rows?: unknown };
    try {
        body = (await readJson(request, 512 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const licence = await readLicence(String(body.licenceKey ?? ''));
    if (!licence) return fail('Kunci lesen tidak sah.', 401);
    if (!isSubscriptionActive(licence)) {
        return fail('Mod senarai hanya untuk langganan bulanan yang aktif.', 402, { licence: publicLicence(licence) });
    }

    let base: NametagSpec;
    try {
        base = parseSpec(body.spec);
    } catch (error) {
        if (error instanceof SpecError) return fail(error.message);
        throw error;
    }

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (rawRows.length === 0) return fail('Senarai kosong. Tambah sekurang-kurangnya satu baris.');
    if (rawRows.length > LIMITS.maxBatchRows) return fail(`Maksimum ${LIMITS.maxBatchRows} tag setiap muat turun.`);

    const { rows, problems } = specsFromRows(base, rawRows);

    const entries: ZipEntry[] = [];
    const hashes: string[] = [];
    const used = new Set<string>();

    for (const { index, spec } of rows) {
        const tag = await generateTag(spec);
        entries.push({ name: uniqueName(spec, index, used), data: tag.stl });
        hashes.push(specHash(spec));
    }

    if (entries.length === 0) return fail(`Tiada tag yang boleh dijana. ${problems.join(' ')}`.trim());

    await recordBatch(licence, hashes);
    const zip = createZip(entries);

    return new Response(toBody(zip), {
        headers: {
            ...attachment(`kakas-nametag-${entries.length}-tag.zip`, 'application/zip', zip.length),
            'X-Kakas-Count': String(entries.length),
            'X-Kakas-Notes': encodeURIComponent(JSON.stringify(problems))
        }
    });
};

function uniqueName(spec: NametagSpec, index: number, used: Set<string>): string {
    const slug =
        (spec.lines[0]?.text ?? `tag-${index + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || `tag-${index + 1}`;

    let name = `${String(index + 1).padStart(2, '0')}-${slug}.stl`;
    let counter = 2;
    while (used.has(name)) name = `${String(index + 1).padStart(2, '0')}-${slug}-${counter++}.stl`;
    used.add(name);
    return name;
}

export const GET: APIRoute = async () => json({ ok: false, error: 'Gunakan POST untuk mod senarai.' }, 405);
