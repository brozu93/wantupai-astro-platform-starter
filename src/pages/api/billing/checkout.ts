import type { APIRoute } from 'astro';
import { toLang } from '../../../i18n';
import { useTranslations } from '../../../i18n/ui';
import { fail, json, originOf, readJson } from '../../../lib/api/respond';
import { CheckoutError, startCheckout } from '../../../lib/billing/checkout';

export const prerender = false;

/** Starts a purchase and hands back the URL to send the customer to. */
export const POST: APIRoute = async ({ request }) => {
    let body: { plan?: string; email?: string; lang?: string };
    try {
        body = (await readJson(request, 8 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const lang = toLang(body.lang);
    const t = useTranslations(lang);

    try {
        const result = await startCheckout({
            planId: String(body.plan ?? ''),
            email: String(body.email ?? ''),
            origin: originOf(request)
        });
        return json({ ok: true, ...result });
    } catch (error) {
        if (error instanceof CheckoutError) return fail(error.message);
        return fail(t('api.checkout.failed', { message: (error as Error).message }), 502);
    }
};
