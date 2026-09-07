import { useEffect, useState } from 'react';

const LICENCE_STORAGE_KEY = 'kakas.licence';

interface LicenceView {
    key: string;
    plan: string;
    email: string;
    credits: number;
    unlimited: boolean;
    demo: boolean;
    designs: number;
    createdAt: string;
    subscription: { status: string; currentPeriodEnd: string } | null;
}

const PLAN_LABELS: Record<string, string> = { sekali: 'Bayar Sekali', bulanan: 'Langganan Bulanan' };
const STATUS_LABELS: Record<string, string> = { active: 'Aktif', past_due: 'Tertunggak', canceled: 'Dibatalkan' };

/** Lets someone check what their key is good for, and stores it for the studio. */
export default function LicenceLookup() {
    const [input, setInput] = useState('');
    const [licence, setLicence] = useState<LicenceView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const saved = window.localStorage.getItem(LICENCE_STORAGE_KEY);
        if (saved) {
            setInput(saved);
            void lookup(saved);
        }
        // Only on first render; the visitor drives everything after that.
    }, []);

    async function lookup(key: string) {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/billing/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenceKey: key })
            });
            const data = (await response.json()) as { ok: boolean; licence?: LicenceView; error?: string };
            if (!response.ok || !data.licence) throw new Error(data.error ?? 'Kunci lesen tidak dijumpai.');
            setLicence(data.licence);
            window.localStorage.setItem(LICENCE_STORAGE_KEY, data.licence.key);
        } catch (caught) {
            setLicence(null);
            setError((caught as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <form
                className="panel space-y-4 p-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    void lookup(input);
                }}
            >
                <label className="block">
                    <span className="field-label">Kunci lesen</span>
                    <input
                        type="text"
                        className="input input-bordered tabular w-full bg-graphite-900/70"
                        placeholder="KKS-XXXX-XXXX-XXXX-XXXX-XXXX"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy || input.trim() === ''}>
                    {busy ? 'Menyemak…' : 'Semak lesen'}
                </button>
                {error && <p className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>}
            </form>

            {licence && (
                <div className="panel space-y-3 p-6">
                    <h2 className="text-lg font-semibold">{PLAN_LABELS[licence.plan] ?? licence.plan}</h2>
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-graphite-400">Kunci</dt>
                            <dd className="tabular break-all">{licence.key}</dd>
                        </div>
                        <div>
                            <dt className="text-graphite-400">E-mel</dt>
                            <dd>{licence.email}</dd>
                        </div>
                        <div>
                            <dt className="text-graphite-400">Kredit berbaki</dt>
                            <dd className="tabular">{licence.unlimited ? 'Tanpa had' : licence.credits}</dd>
                        </div>
                        <div>
                            <dt className="text-graphite-400">Reka bentuk dibeli</dt>
                            <dd className="tabular">{licence.designs}</dd>
                        </div>
                        {licence.subscription && (
                            <div className="sm:col-span-2">
                                <dt className="text-graphite-400">Langganan</dt>
                                <dd>
                                    {STATUS_LABELS[licence.subscription.status] ?? licence.subscription.status} — sah sehingga{' '}
                                    {new Date(licence.subscription.currentPeriodEnd).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </dd>
                            </div>
                        )}
                    </dl>

                    {licence.demo && (
                        <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
                            Lesen demo — dikeluarkan tanpa pembayaran sebenar kerana gerbang pembayaran belum dikonfigurasikan di tapak ini.
                        </p>
                    )}

                    <a href="/apps/nametag" className="btn btn-primary btn-sm">
                        Buka Studio Nametag
                    </a>
                </div>
            )}
        </div>
    );
}
