/** What KAKAS sells, and what each purchase unlocks. */

import type { UiKey } from '../../i18n/ui';

export type PlanId = 'sekali' | 'bulanan';

export interface Plan {
    id: PlanId;
    /** Price in sen (1/100 ringgit), so nothing is ever stored as a float. */
    amount: number;
    currency: 'myr';
    /** Stripe Checkout mode. */
    mode: 'payment' | 'subscription';
    /** Design credits granted on purchase. Undefined means unlimited. */
    credits?: number;
    /**
     * Display copy lives in the string table, not here.
     *
     * A plan is the same commercial object in either language - same price, same entitlement -
     * so what changes is only how it is described. Keeping keys rather than sentences means the
     * name on a Stripe receipt follows the language the buyer was reading.
     */
    labelKey: UiKey;
    taglineKey: UiKey;
    bestForKey: UiKey;
    featureKeys: UiKey[];
}

export const PLANS: Plan[] = [
    {
        id: 'sekali',
        amount: 1500,
        currency: 'myr',
        mode: 'payment',
        credits: 1,
        labelKey: 'plan.sekali.label',
        taglineKey: 'plan.sekali.tagline',
        bestForKey: 'plan.sekali.bestFor',
        featureKeys: ['plan.sekali.f1', 'plan.sekali.f2', 'plan.sekali.f3', 'plan.sekali.f4', 'plan.sekali.f5']
    },
    {
        id: 'bulanan',
        amount: 2900,
        currency: 'myr',
        mode: 'subscription',
        labelKey: 'plan.bulanan.label',
        taglineKey: 'plan.bulanan.tagline',
        bestForKey: 'plan.bulanan.bestFor',
        featureKeys: ['plan.bulanan.f1', 'plan.bulanan.f2', 'plan.bulanan.f3', 'plan.bulanan.f4', 'plan.bulanan.f5', 'plan.bulanan.f6']
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
    labelKey: 'plan.free.label',
    featureKeys: ['plan.free.f1', 'plan.free.f2', 'plan.free.f3']
} as const satisfies { labelKey: UiKey; featureKeys: readonly UiKey[] };
