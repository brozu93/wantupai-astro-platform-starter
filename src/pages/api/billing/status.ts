import type { APIRoute } from 'astro';
import { toLang } from '../../../i18n';
import { useTranslations } from '../../../i18n/ui';
import { fail, json, readJson } from '../../../lib/api/respond';
import { publicLicence, readLicence } from '../../../lib/billing/licences';

export const prerender = false;

/** Looks up what a licence key is currently good for. */
export const POST: APIRoute = async ({ request }) => {
    let body: { licenceKey?: string; lang?: string };
    try {
        body = (await readJson(request, 8 * 1024)) as typeof body;
    } catch (error) {
        return fail((error as Error).message);
    }

    const lang = toLang(body.lang);
    const t = useTranslations(lang);

    const licence = await readLicence(String(body.licenceKey ?? ''));
    if (!licence) return fail(t('api.licence.notFound'), 404);

    return json({ ok: true, licence: publicLicence(licence) });
};
