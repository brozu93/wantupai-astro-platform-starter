import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api/respond';
import { CheckoutError, claimDemo, claimSession } from '../../../lib/billing/checkout';
import { publicLicence } from '../../../lib/billing/licences';

export const prerender = false;

/**
 * Exchanges a finished payment for the licence key.
 *
 * The success page calls this rather than waiting for the webhook, so the customer sees their
 * key immediately. Both paths are idempotent: refreshing the page returns the same licence
 * instead of issuing another one.
 */
export const POST: APIRoute = async ({ request }) => {
    let body: { sessionId?: string; demo?: string };
    try {
        body = (await readJson(request, 8 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    try {
        const licence = body.demo ? await claimDemo(String(body.demo)) : await claimSession(String(body.sessionId ?? ''));
        return json({ ok: true, licence: publicLicence(licence) });
    } catch (error) {
        if (error instanceof CheckoutError) return fail(error.message, 409);
        return fail(`Gagal mengesahkan pembayaran: ${(error as Error).message}`, 502);
    }
};
