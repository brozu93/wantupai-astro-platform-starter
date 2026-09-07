import { useState } from 'react';
import { PLANS, formatPrice } from '../../lib/billing/plans';
import type { PlanId } from '../../lib/billing/plans';

interface Props {
    /** Pre-selects a plan when the visitor arrived from a specific card. */
    initialPlan?: PlanId;
}

/** The purchase form on the pricing page. */
export default function PlanPicker({ initialPlan = 'sekali' }: Props) {
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
                body: JSON.stringify({ plan, email })
            });
            const data = (await response.json()) as { ok: boolean; url?: string; error?: string };
            if (!response.ok || !data.url) throw new Error(data.error ?? 'Gagal memulakan pembayaran.');
            window.location.href = data.url;
        } catch (caught) {
            setError((caught as Error).message);
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="panel space-y-5 p-6">
            <fieldset>
                <legend className="field-label">Pilih pelan</legend>
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
                                <span className="font-semibold">{option.label}</span>
                                <span className="tabular font-bold text-brass-300">
                                    {formatPrice(option.amount)}
                                    {option.mode === 'subscription' && <span className="text-xs font-normal text-graphite-400">/bulan</span>}
                                </span>
                            </span>
                            <span className="mt-1 block text-xs text-graphite-300">{option.bestFor}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <label className="block">
                <span className="field-label">E-mel</span>
                <input
                    type="email"
                    required
                    className="input input-bordered w-full bg-graphite-900/70"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nama@sekolah.edu.my"
                    autoComplete="email"
                />
                <span className="mt-1 block text-xs text-graphite-400">Kunci lesen dipaparkan sebaik sahaja pembayaran selesai. Simpan e-mel ini untuk rujukan.</span>
            </label>

            {error && <p className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>}

            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
                {busy ? 'Menyediakan…' : `Teruskan — ${selected ? formatPrice(selected.amount) : ''}${selected?.mode === 'subscription' ? ' sebulan' : ''}`}
            </button>
        </form>
    );
}
