/** What KAKAS sells, and what each purchase unlocks. */

export type PlanId = 'sekali' | 'bulanan';

export interface Plan {
    id: PlanId;
    label: string;
    tagline: string;
    /** Price in sen (1/100 ringgit), so nothing is ever stored as a float. */
    amount: number;
    currency: 'myr';
    /** Stripe Checkout mode. */
    mode: 'payment' | 'subscription';
    /** Design credits granted on purchase. Undefined means unlimited. */
    credits?: number;
    features: string[];
    /** Shown on the pricing card as the most common reason to pick this plan. */
    bestFor: string;
}

export const PLANS: Plan[] = [
    {
        id: 'sekali',
        label: 'Bayar Sekali',
        tagline: 'Satu reka bentuk, guna selamanya',
        amount: 1500,
        currency: 'myr',
        mode: 'payment',
        credits: 1,
        bestFor: 'Seorang guru atau staf yang perlukan satu tag sahaja',
        features: [
            '1 kredit reka bentuk STL',
            'Muat turun semula reka bentuk yang sama percuma',
            'Semua saiz, fon, timbul atau ukir',
            'Poket magnet, peniti atau lubang tali',
            'Guna untuk cetakan sendiri, selamanya'
        ]
    },
    {
        id: 'bulanan',
        label: 'Langganan Bulanan',
        tagline: 'STL tanpa had untuk sekolah dan bisnes',
        amount: 2900,
        currency: 'myr',
        mode: 'subscription',
        bestFor: 'Sekolah, koperasi dan pengusaha cetakan 3D',
        features: [
            'Reka bentuk STL tanpa had',
            'Mod senarai: satu fail ZIP untuk seluruh staf',
            'Mod plat: seluruh senarai tersusun atas dandang, satu kali cetak',
            'Semua ciri Bayar Sekali',
            'Lesen guna komersial - boleh jual tag yang dicetak',
            'Batal bila-bila masa'
        ]
    }
];

export function findPlan(id: string): Plan | undefined {
    return PLANS.find((plan) => plan.id === id);
}

/** Formats sen as a Malaysian ringgit price, e.g. 2900 becomes "RM 29.00". */
export function formatPrice(amount: number): string {
    return `RM ${(amount / 100).toFixed(2)}`;
}

/** What someone gets without paying anything. */
export const FREE_TIER = {
    label: 'Percuma',
    features: ['Reka dan lihat pratonton penuh', 'Muat turun STL contoh untuk uji tetapan pencetak', 'Semua preset dan panduan cetakan']
} as const;
