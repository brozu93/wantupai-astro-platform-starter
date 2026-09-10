import { useState } from 'react';
import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { useTranslations } from '../../i18n/ui';
import { PLANS, formatPrice } from '../../lib/billing/plans';
import type { PlanId } from '../../lib/billing/plans';

interface Props {
    lang?: Lang;
    open: boolean;
    onClose: () => void;
    /** Explains why the dialog opened, e.g. credits ran out. */
    reason?: string;
}

/** Turns a finished design into a purchase, without leaving the studio until Stripe takes over. */
export default function PaywallDialog({ open, onClose, reason, lang = DEFAULT_LANG }: Props) {
    const t = useTranslations(lang);
    const [plan, setPlan] = useState<PlanId>('sekali');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan, email })
            });
            const data = (await response.json()) as { ok: boolean; url?: string; error?: string };
            if (!response.ok || !data.url) throw new Error(data.error ?? t('picker.failed'));
            window.location.href = data.url;
        } catch (caught) {
            setError((caught as Error).message);
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
            <div className="panel max-h-[92vh] w-full max-w-2xl overflow-y-auto bg-graphite-800 p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h2 id="paywall-title" className="text-xl font-bold">
                            Buka kunci muat turun STL
                        </h2>
                        <p className="mt-1 text-sm text-graphite-300">{reason ?? t('paywall.body')}</p>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Tutup">
                        ✕
                    </button>
                </div>

                <form onSubmit={submit} className="space-y-5">
                    <fieldset className="grid gap-3 sm:grid-cols-2">
                        <legend className="sr-only">{t('paywall.choose')}</legend>
                        {PLANS.map((option) => (
                            <label
                                key={option.id}
                                className={`cursor-pointer rounded-xl border p-4 transition ${
                                    plan === option.id ? 'border-brass-400 bg-brass-400/10' : 'border-white/10 bg-graphite-900/50 hover:border-white/25'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="plan"
                                    className="sr-only"
                                    value={option.id}
                                    checked={plan === option.id}
                                    onChange={() => setPlan(option.id)}
                                />
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="font-semibold">{t(option.labelKey)}</span>
                                    <span className="tabular font-bold text-brass-300">
                                        {formatPrice(option.amount)}
                                        {option.mode === 'subscription' && <span className="text-xs font-normal text-graphite-400">{t('picker.perMonth')}</span>}
                                    </span>
                                </span>
                                <span className="mt-1 block text-xs text-graphite-300">{t(option.taglineKey)}</span>
                                <ul className="mt-3 space-y-1 text-xs text-graphite-300">
                                    {option.featureKeys.slice(0, 3).map((key) => (
                                        <li key={key} className="flex gap-2">
                                            <span aria-hidden="true" className="text-brass-400">
                                                ✓
                                            </span>
                                            {t(key)}
                                        </li>
                                    ))}
                                </ul>
                            </label>
                        ))}
                    </fieldset>

                    <label className="block">
                        <span className="field-label">{t('paywall.emailLegend')}</span>
                        <input
                            type="email"
                            required
                            className="input input-bordered w-full bg-graphite-900/70"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="nama@sekolah.edu.my"
                            autoComplete="email"
                        />
                    </label>

                    {error && <p className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>}

                    <div className="flex flex-wrap items-center gap-3">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? t('picker.preparing') : t('paywall.continue')}
                        </button>
                        <a href="/harga" className="text-sm text-graphite-300 underline underline-offset-4">
                            Lihat perbandingan penuh
                        </a>
                    </div>

                    <p className="text-xs text-graphite-400">
                        Sudah ada kunci lesen? Tutup tetingkap ini dan masukkan kunci pada panel “Lesen” di bawah pratonton.
                    </p>
                </form>
            </div>
        </div>
    );
}
