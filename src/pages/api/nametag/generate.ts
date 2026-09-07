import type { APIRoute } from 'astro';
import { attachment, fail, json, readJson, toBody } from '../../../lib/api/respond';
import { checkEntitlement, publicLicence, readLicence, recordGeneration } from '../../../lib/billing/licences';
import { generateTag } from '../../../lib/nametag/generate';
import type { NametagSpec } from '../../../lib/nametag/types';
import { SpecError, parseSpec, specHash, suggestedFilename } from '../../../lib/nametag/validate';

export const prerender = false;

/**
 * Builds the paid STL.
 *
 * Generation lives on the server on purpose: the browser gets an exact preview from the same
 * layout code, but the geometry - the part people are paying for - is only ever produced
 * behind a licence check.
 */
export const POST: APIRoute = async ({ request }) => {
    let body: { licenceKey?: string; spec?: unknown };
    try {
        body = (await readJson(request)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const licence = await readLicence(String(body.licenceKey ?? ''));
    if (!licence) return fail('Kunci lesen tidak sah. Semak semula atau beli lesen di /harga.', 401);

    let spec: NametagSpec;
    try {
        spec = parseSpec(body.spec);
    } catch (error) {
        if (error instanceof SpecError) return fail(error.message);
        throw error;
    }

    const hash = specHash(spec);
    const entitlement = checkEntitlement(licence, hash);
    if (!entitlement.allowed) {
        return fail(entitlement.reason ?? 'Lesen ini tidak membenarkan penjanaan.', 402, { licence: publicLicence(licence) });
    }

    const tag = await generateTag(spec);
    const updated = await recordGeneration(licence, hash, entitlement.consumesCredit);

    return new Response(toBody(tag.stl), {
        headers: {
            ...attachment(suggestedFilename(spec), 'model/stl', tag.stl.length),
            // The studio reads these to show print notes without a second request.
            'X-Kakas-Credits': String(updated.credits),
            'X-Kakas-Repeat': entitlement.repeat ? '1' : '0',
            'X-Kakas-Triangles': String(tag.triangles),
            'X-Kakas-Notes': encodeURIComponent(JSON.stringify([...tag.notes, ...tag.warnings]))
        }
    });
};

export const GET: APIRoute = async () => json({ ok: false, error: 'Gunakan POST untuk menjana STL.' }, 405);
