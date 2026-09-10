import type { APIRoute } from 'astro';
import { toLang } from '../../../i18n';
import { useTranslations } from '../../../i18n/ui';
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
    let body: { sessionId?: string; demo?: string; lang?: string };
    try {
        body = (await readJson(request, 8 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const lang = toLang(body.lang);
    const t = useTranslations(lang);

    try {
        const licence = body.demo ? await claimDemo(String(body.demo)) : await claimSession(String(body.sessionId ?? ''));
        return json({ ok: true, licence: publicLicence(licence) });
    } catch (error) {
        if (error instanceof CheckoutError) return fail(error.message, 409);
        return fail(t('api.claim.failed', { message: (error as Error).message }), 502);
    }
};
