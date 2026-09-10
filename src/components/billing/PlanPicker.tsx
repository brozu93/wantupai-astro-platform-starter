import { useState } from 'react';
import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { useTranslations } from '../../i18n/ui';
import { PLANS, formatPrice } from '../../lib/billing/plans';
import type { PlanId } from '../../lib/billing/plans';

interface Props {
    lang?: Lang;
    /** Pre-selects a plan when the visitor arrived from a specific card. */
    initialPlan?: PlanId;
}

/** The purchase form on the pricing page. */
export default function PlanPicker({ lang = DEFAULT_LANG, initialPlan = 'sekali' }: Props) {
    const t = useTranslations(lang);
    const [plan, setPlan] = useState<PlanId>(initialPlan);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selected = PLANS.find((item) => item.id === plan);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The gateway builds its return URLs and its product name from this, so the
                // buyer comes back to the language they were reading.
                body: JSON.stringify({ plan, email, lang })
            });
            const data = (await response.json()) as { ok: boolean; url?: string; error?: string };
            if (!response.ok || !data.url) throw new Error(data.error ?? t('picker.failed'));
            window.location.href = data.url;
        } catch (caught) {
            setError((caught as Error).message);
            setBusy(false);
        }
    }

    const price = selected ? formatPrice(selected.amount) : '';

    return (
        <form onSubmit={submit} className="panel space-y-5 p-6">
            <fieldset>
                <legend className="field-label">{t('paywall.choose')}</legend>
                <div className="mt-1 grid gap-3 sm:grid-cols-2">
                    {PLANS.map((option) => (
                        <label
                            key={option.id}
                            className={`cursor-pointer rounded-xl border p-4 transition ${
                                plan === option.id ? 'border-brass-400 bg-brass-400/10' : 'border-white/10 bg-graphite-900/50 hover:border-white/25'
                            }`}
                        >
                            <input type="radio" name="plan" className="sr-only" value={option.id} checked={plan === option.id} onChange={() => setPlan(option.id)} />
                            <span className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold">{t(option.labelKey)}</span>
                                <span className="tabular font-bold text-brass-300">
                                    {formatPrice(option.amount)}
                                    {option.mode === 'subscription' && <span className="text-xs font-normal text-graphite-400">{t('picker.perMonth')}</span>}
                                </span>
                            </span>
                            <span className="mt-1 block text-xs text-graphite-300">{t(option.bestForKey)}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <label className="block">
                <span className="field-label">{t('picker.emailLabel')}</span>
                <input
                    type="email"
                    required
                    className="input input-bordered w-full bg-graphite-900/70"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('picker.emailPlaceholder')}
                    autoComplete="email"
                />
                <span className="mt-1 block text-xs text-graphite-400">{t('picker.emailHint')}</span>
            </label>

            {error && <p className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>}

            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
                {busy ? t('picker.preparing') : t(selected?.mode === 'subscription' ? 'picker.continueSub' : 'picker.continue', { price })}
            </button>
        </form>
    );
}
