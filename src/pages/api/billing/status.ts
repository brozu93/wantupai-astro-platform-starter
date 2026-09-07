import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api/respond';
import { publicLicence, readLicence } from '../../../lib/billing/licences';

export const prerender = false;

/** Looks up what a licence key is currently good for. */
export const POST: APIRoute = async ({ request }) => {
    let body: { licenceKey?: string };
    try {
        body = (await readJson(request, 8 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const licence = await readLicence(String(body.licenceKey ?? ''));
    if (!licence) return fail('Kunci lesen tidak dijumpai. Semak ejaan atau semak e-mel resit anda.', 404);

    return json({ ok: true, licence: publicLicence(licence) });
};
