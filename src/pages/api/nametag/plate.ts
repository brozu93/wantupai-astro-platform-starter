import type { APIRoute } from 'astro';
import { DEFAULT_LANG, toLang } from '../../../i18n';
import { translate, useTranslations } from '../../../i18n/ui';
import { attachment, fail, json, readJson, toBody } from '../../../lib/api/respond';
import { isSubscriptionActive, publicLicence, readLicence, recordBatch } from '../../../lib/billing/licences';
import { generatePlate } from '../../../lib/nametag/generate';
import { LIMITS } from '../../../lib/nametag/presets';
import type { NametagSpec } from '../../../lib/nametag/types';
import { SpecError, parsePlateOptions, parseSpec, specHash, specsFromRows } from '../../../lib/nametag/validate';
import { createZip } from '../../../lib/nametag/zip';
import type { ZipEntry } from '../../../lib/nametag/zip';

export const prerender = false;

/**
 * Generates the whole list as tags already arranged on the build plate.
 *
 * This is the difference between a folder of sixty files and one print job. The list is split
 * across as many plates as the bed needs; a single plate comes back as an STL, several come
 * back as a ZIP of plates. Like list mode, it is a subscription feature.
 */
export const POST: APIRoute = async ({ request }) => {
    let body: { licenceKey?: string; spec?: unknown; rows?: unknown; plate?: unknown; lang?: string };
    try {
        body = (await readJson(request, 512 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const lang = toLang(body.lang);
    const t = useTranslations(lang);

    const licence = await readLicence(String(body.licenceKey ?? ''));
    if (!licence) return fail(t('api.licence.invalid'), 401);
    if (!isSubscriptionActive(licence)) {
        return fail(t('api.plate.subOnly'), 402, { licence: publicLicence(licence) });
    }

    let base: NametagSpec;
    try {
        base = parseSpec(body.spec, lang);
    } catch (error) {
        if (error instanceof SpecError) return fail(error.message);
        throw error;
    }

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (rawRows.length === 0) return fail(t('api.list.empty'));
    if (rawRows.length > LIMITS.maxBatchRows) return fail(t('api.list.max', { max: LIMITS.maxBatchRows }));

    const { rows, problems } = specsFromRows(base, rawRows, lang);
    if (rows.length === 0) return fail(t('api.list.none', { problems: problems.join(' ') }).trim());

    const options = { ...parsePlateOptions(body.plate), lang };
    const specs = rows.map((row) => row.spec);

    let plates: Awaited<ReturnType<typeof generatePlate>>[];
    try {
        plates = await buildPlates(specs, options);
    } catch (error) {
        return fail((error as Error).message);
    }

    await recordBatch(licence, specs.map(specHash));

    const notes = [...new Set(plates.flatMap((plate) => plate.notes))];
    const warnings = [...new Set(plates.flatMap((plate) => plate.warnings))];
    const first = plates[0].arrangement;
    const headers = {
        'X-Kakas-Count': String(specs.length),
        'X-Kakas-Plates': String(plates.length),
        'X-Kakas-Layout': `${first.columns}x${first.rows}`,
        'X-Kakas-Size': `${first.width.toFixed(1)}x${first.height.toFixed(1)}`,
        'X-Kakas-Notes': encodeURIComponent(JSON.stringify([...problems, ...notes, ...warnings]))
    };

    if (plates.length === 1) {
        const stl = plates[0].stl;
        return new Response(toBody(stl), {
            headers: {
                ...attachment(plateFilename(base, 1, plates[0].arrangement.placed, 'stl'), 'model/stl', stl.length),
                ...headers
            }
        });
    }

    const entries: ZipEntry[] = plates.map((plate, index) => ({
        name: plateFilename(base, index + 1, plate.arrangement.placed, 'stl'),
        data: plate.stl
    }));
    const zip = createZip(entries);

    return new Response(toBody(zip), {
        headers: {
            ...attachment(`kakas-plat-${plates.length}-dandang-${specs.length}-tag.zip`, 'application/zip', zip.length),
            ...headers
        }
    });
};

/**
 * Splits the list across beds. The first plate settles the arrangement, and every later plate
 * reuses that same column count so a two-plate job prints as two identical-looking trays.
 */
async function buildPlates(specs: NametagSpec[], options: Parameters<typeof generatePlate>[1]) {
    const plates: Awaited<ReturnType<typeof generatePlate>>[] = [];
    let remaining = specs;

    while (remaining.length > 0) {
        const plate = await generatePlate(remaining, plates.length === 0 ? options : { ...options, columns: plates[0].arrangement.columns });
        plates.push(plate);
        remaining = remaining.slice(plate.arrangement.placed);

        // Defensive: a plate that places nothing would loop forever.
        if (plate.arrangement.placed === 0) break;
    }

    return plates;
}

function plateFilename(spec: NametagSpec, index: number, count: number, extension: string): string {
    return `kakas-plat-${index}-${count}-tag-${spec.width}x${spec.height}mm.${extension}`;
}

export const GET: APIRoute = async () => json({ ok: false, error: translate(DEFAULT_LANG, 'api.method.plate') }, 405);
