import { randomBytes } from 'node:crypto';
import type { Lang } from '../../i18n';
import { DEFAULT_LANG, path } from '../../i18n';
import { useTranslations } from '../../i18n/ui';
import { addCredits, createLicence, readLicence, writeLicence } from './licences';
import type { Licence, SubscriptionState } from './licences';
import type { Plan, PlanId } from './plans';
import { findPlan, formatPrice } from './plans';
import { getStore } from './store';
import {
    createCheckoutSession,
    customerId,
    paymentsConfigured,
    retrieveCheckoutSession,
    retrieveSubscription,
    subscriptionPeriodEnd
} from './stripe';
import type { CheckoutSession, StripeSubscription } from './stripe';

const ORDER_STORE = 'kakas-orders';

/** Links a payment back to the licence it produced, so a claim is never fulfilled twice. */
interface OrderRecord {
    reference: string;
    plan: PlanId;
    email: string;
    licenceKey?: string;
    demo: boolean;
    createdAt: string;
}

export interface CheckoutStart {
    url: string;
    /** True when no payment provider is configured and the purchase is simulated. */
    demo: boolean;
}

export class CheckoutError extends Error {}

function reference(): string {
    return randomBytes(16).toString('hex');
}

async function orders() {
    return getStore(ORDER_STORE);
}

/**
 * Begins a purchase and returns where to send the customer.
 *
 * With Stripe keys present this is a real Checkout Session. Without them the site still works
 * end to end in demo mode: no money moves, and every licence it issues is flagged as a demo
 * licence wherever it is shown.
 */
export async function startCheckout(input: { planId: string; email: string; origin: string; lang?: Lang }): Promise<CheckoutStart> {
    const lang = input.lang ?? DEFAULT_LANG;
    const t = useTranslations(lang);
    const plan = findPlan(input.planId);
    if (!plan) throw new CheckoutError(t('checkout.planUnknown'));

    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CheckoutError(t('checkout.emailInvalid'));

    const ref = reference();
    const store = await orders();
    const order: OrderRecord = { reference: ref, plan: plan.id, email, demo: !paymentsConfigured(), createdAt: new Date().toISOString() };

    if (!paymentsConfigured()) {
        await store.set(`demo:${ref}`, order);
        return { url: `${input.origin}${path('paymentDone', lang)}?demo=${ref}`, demo: true };
    }

    const session = await createCheckoutSession({
        mode: plan.mode,
        amount: plan.amount,
        currency: plan.currency,
        productName: t('checkout.productName', { plan: t(plan.labelKey) }),
        productDescription: planDescription(plan, lang),
        successUrl: `${input.origin}${path('paymentDone', lang)}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${input.origin}${path('paymentCancelled', lang)}`,
        email,
        metadata: { plan: plan.id, reference: ref }
    });

    if (!session.url) throw new CheckoutError(t('checkout.noUrl'));
    await store.set(`ref:${ref}`, { ...order, reference: ref });
    return { url: session.url, demo: false };
}

function planDescription(plan: Plan, lang: Lang): string {
    const t = useTranslations(lang);
    const price = formatPrice(plan.amount);
    return t(plan.mode === 'subscription' ? 'checkout.descSubscription' : 'checkout.descOnce', { price });
}

/** Turns a completed demo purchase into a licence. Safe to call more than once. */
export async function claimDemo(ref: string, lang: Lang = DEFAULT_LANG): Promise<Licence> {
    const t = useTranslations(lang);
    const store = await orders();
    const order = await store.get<OrderRecord>(`demo:${ref}`);
    if (!order) throw new CheckoutError(t('checkout.demoNotFound'));

    if (order.licenceKey) {
        const existing = await readLicence(order.licenceKey);
        if (existing) return existing;
    }

    const plan = findPlan(order.plan);
    if (!plan) throw new CheckoutError(t('checkout.planUnknown'));

    const licence = await issueLicence(plan, order.email, {
        demo: true,
        subscription:
            plan.mode === 'subscription'
                ? { status: 'active', currentPeriodEnd: new Date(Date.now() + 31 * 86_400_000).toISOString() }
                : undefined
    });

    await store.set(`demo:${ref}`, { ...order, licenceKey: licence.key });
    return licence;
}

/** Turns a completed Stripe Checkout Session into a licence. Safe to call more than once. */
export async function claimSession(sessionId: string, lang: Lang = DEFAULT_LANG): Promise<Licence> {
    const t = useTranslations(lang);
    const store = await orders();
    const already = await store.get<{ licenceKey: string }>(`session:${sessionId}`);
    if (already?.licenceKey) {
        const existing = await readLicence(already.licenceKey);
        if (existing) return existing;
    }

    const session = await retrieveCheckoutSession(sessionId);
    if (!isPaid(session)) throw new CheckoutError(t('checkout.notComplete'));

    const licence = await licenceForSession(session, lang);
    await store.set(`session:${sessionId}`, { licenceKey: licence.key });
    return licence;
}

function isPaid(session: CheckoutSession): boolean {
    if (session.mode === 'subscription') return session.status === 'complete';
    return session.payment_status === 'paid';
}

async function licenceForSession(session: CheckoutSession, lang: Lang = DEFAULT_LANG): Promise<Licence> {
    const t = useTranslations(lang);
    const plan = findPlan(session.metadata?.plan ?? '');
    if (!plan) throw new CheckoutError(t('checkout.sessionNoPlan'));

    const email = session.customer_details?.email ?? session.customer_email ?? '';
    let subscription: SubscriptionState | undefined;

    if (plan.mode === 'subscription') {
        const raw = session.subscription;
        const full: StripeSubscription | null = typeof raw === 'string' ? await retrieveSubscription(raw) : (raw ?? null);
        if (full) {
            subscription = {
                status: full.status === 'active' || full.status === 'trialing' ? 'active' : full.status === 'past_due' ? 'past_due' : 'canceled',
                currentPeriodEnd: subscriptionPeriodEnd(full),
                stripeSubscriptionId: full.id
            };
        }
    }

    return issueLicence(plan, email, { subscription, stripeCustomerId: customerId(session.customer) });
}

/**
 * Creates the licence, or tops up the customer's existing one.
 *
 * Buying a second one-off pack should add a credit to the key someone already has rather than
 * hand them a second key to keep track of, so purchases are matched on e-mail address.
 */
async function issueLicence(
    plan: Plan,
    email: string,
    extras: { subscription?: SubscriptionState; stripeCustomerId?: string; demo?: boolean }
): Promise<Licence> {
    const store = await orders();
    const existingKey = email ? await store.get<{ licenceKey: string }>(`email:${email}`) : null;
    const existing = existingKey?.licenceKey ? await readLicence(existingKey.licenceKey) : null;

    if (existing) {
        if (plan.mode === 'subscription' && extras.subscription) {
            const updated: Licence = { ...existing, plan: plan.id, subscription: extras.subscription, stripeCustomerId: extras.stripeCustomerId ?? existing.stripeCustomerId };
            await writeLicence(updated);
            await linkSubscription(updated);
            return updated;
        }
        return addCredits(existing, plan.credits ?? 0);
    }

    const licence = await createLicence({
        email,
        plan: plan.id,
        credits: plan.credits ?? 0,
        subscription: extras.subscription,
        stripeCustomerId: extras.stripeCustomerId,
        demo: extras.demo
    });

    if (email) await store.set(`email:${email}`, { licenceKey: licence.key });
    await linkSubscription(licence);
    return licence;
}

async function linkSubscription(licence: Licence): Promise<void> {
    const id = licence.subscription?.stripeSubscriptionId;
    if (!id) return;
    const store = await orders();
    await store.set(`sub:${id}`, { licenceKey: licence.key });
}

/** Applies a subscription lifecycle change from a webhook to the licence it belongs to. */
export async function applySubscriptionUpdate(subscription: StripeSubscription): Promise<Licence | null> {
    const store = await orders();
    const link = await store.get<{ licenceKey: string }>(`sub:${subscription.id}`);
    if (!link?.licenceKey) return null;

    const licence = await readLicence(link.licenceKey);
    if (!licence) return null;

    const status: SubscriptionState['status'] =
        subscription.status === 'active' || subscription.status === 'trialing'
            ? 'active'
            : subscription.status === 'past_due' || subscription.status === 'unpaid'
              ? 'past_due'
              : 'canceled';

    const updated: Licence = {
        ...licence,
        subscription: { status, currentPeriodEnd: subscriptionPeriodEnd(subscription), stripeSubscriptionId: subscription.id }
    };
    await writeLicence(updated);
    return updated;
}

export { ORDER_STORE };
