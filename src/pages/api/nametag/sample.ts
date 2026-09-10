import type { APIRoute } from 'astro';
import { toLang } from '../../../i18n';
import { useTranslations } from '../../../i18n/ui';
import { attachment, fail, toBody } from '../../../lib/api/respond';
import { generateTag } from '../../../lib/nametag/generate';
import { DEFAULT_PRESET, findPreset } from '../../../lib/nametag/presets';
import type { NametagSpec } from '../../../lib/nametag/types';

export const prerender = false;

/**
 * A free STL with fixed wording.
 *
 * The point is to let someone dial in their printer - layer height, magnet fit, how deep the
 * lettering needs to be on their machine - before paying for anything. The size and mounting
 * follow the chosen preset so the test print matches the real thing; only the text is locked.
 */
const SAMPLE_LINES: NametagSpec['lines'] = [
    { text: 'CONTOH KAKAS', font: 'sans-bold', size: 5, tracking: 0.1, transform: 'upper' },
    { text: 'Uji tetapan pencetak', font: 'sans-regular', size: 3, tracking: 0, transform: 'none' }
];

export const GET: APIRoute = async ({ url }) => {
    const lang = toLang(url.searchParams.get('lang'));
    const t = useTranslations(lang);
    const preset = findPreset(url.searchParams.get('preset') ?? '') ?? DEFAULT_PRESET;
    const spec: NametagSpec = { ...preset.spec, lines: SAMPLE_LINES };

    try {
        const tag = await generateTag(spec, lang);
        return new Response(toBody(tag.stl), {
            headers: {
                // Same bytes for every visitor, so it is served from the edge rather than rebuilt.
                ...attachment(`kakas-contoh-${preset.id}-${spec.width}x${spec.height}mm.stl`, 'model/stl', tag.stl.length, { cdnMaxAgeSeconds: 86_400 }),
                'X-Kakas-Notes': encodeURIComponent(JSON.stringify(tag.notes))
            }
        });
    } catch (error) {
        return fail(t('api.sample.failed', { message: (error as Error).message }), 500);
    }
};
