import { useEffect, useState } from 'react';

const LICENCE_STORAGE_KEY = 'kakas.licence';

interface LicenceView {
    key: string;
    plan: string;
    credits: number;
    unlimited: boolean;
    demo: boolean;
}

const PLAN_LABELS: Record<string, string> = { sekali: 'Bayar Sekali', bulanan: 'Langganan Bulanan' };

/**
 * Exchanges the finished payment for a licence key as soon as the customer lands here, so the
 * key is on screen before the webhook has even arrived.
 */
export default function ClaimLicence() {
    const [licence, setLicence] = useState<LicenceView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const demo = params.get('demo');
        if (!sessionId && !demo) {
            setError('Pautan ini tiada rujukan pembayaran. Buka semula pautan daripada e-mel resit anda.');
            return;
        }

        let cancelled = false;
        const claim = async (attempt = 0): Promise<void> => {
            try {
                const response = await fetch('/api/billing/claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(demo ? { demo } : { sessionId })
                });
                const data = (await response.json()) as { ok: boolean; licence?: LicenceView; error?: string };
                if (cancelled) return;

                if (!response.ok || !data.licence) {
                    // Stripe can take a moment to mark a session paid; retry a couple of times
                    // before telling the customer anything is wrong.
                    if (response.status === 409 && attempt < 3) {
                        setTimeout(() => void claim(attempt + 1), 1500 * (attempt + 1));
                        return;
                    }
                    throw new Error(data.error ?? 'Gagal mengesahkan pembayaran.');
                }

                setLicence(data.licence);
                window.localStorage.setItem(LICENCE_STORAGE_KEY, data.licence.key);
            } catch (caught) {
                if (!cancelled) setError((caught as Error).message);
            }
        };

        void claim();
        return () => {
            cancelled = true;
        };
    }, []);

    if (error) {
        return (
            <div className="panel space-y-3 p-6">
                <p className="text-error">{error}</p>
                <p className="text-sm text-graphite-300">
                    Jika wang sudah ditolak, hubungi kami dengan alamat e-mel yang digunakan semasa pembayaran dan kunci lesen akan dihantar semula.
                </p>
                <a href="/harga" className="btn btn-outline btn-sm border-white/20">
                    Kembali ke harga
                </a>
            </div>
        );
    }

    if (!licence) {
        return (
            <div className="panel p-6">
                <p className="text-graphite-300">Mengesahkan pembayaran…</p>
            </div>
        );
    }

    return (
        <div className="panel space-y-5 p-6">
            <div>
                <p className="field-label">Kunci lesen anda</p>
                <div className="flex flex-wrap items-center gap-3">
                    <code className="tabular break-all rounded-lg bg-graphite-900 px-3 py-2 text-lg font-semibold text-brass-300">{licence.key}</code>
                    <button
                        type="button"
                        className="btn btn-sm"
                        onClick={async () => {
                            await navigator.clipboard.writeText(licence.key);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        }}
                    >
                        {copied ? 'Disalin' : 'Salin'}
                    </button>
                </div>
                <p className="mt-2 text-sm text-graphite-300">
                    Simpan kunci ini. Kunci sudah disimpan dalam pelayar ini, jadi Studio Nametag akan mengenali anda secara automatik.
                </p>
            </div>

            <p className="text-sm">
                <span className="text-graphite-400">Pelan:</span> {PLAN_LABELS[licence.plan] ?? licence.plan} —{' '}
                {licence.unlimited ? 'STL tanpa had' : `${licence.credits} kredit reka bentuk`}
            </p>

            {licence.demo && (
                <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning">
                    Ini lesen demo: tapak ini belum disambungkan kepada gerbang pembayaran, jadi tiada wang bertukar tangan.
                </p>
            )}

            <a href="/apps/nametag" className="btn btn-primary">
                Kembali ke Studio Nametag
            </a>
        </div>
    );
}
