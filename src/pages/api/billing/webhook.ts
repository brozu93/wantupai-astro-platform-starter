import type { APIRoute } from 'astro';
import { json } from '../../../lib/api/respond';
import { applySubscriptionUpdate, claimSession } from '../../../lib/billing/checkout';
import { retrieveSubscription, stripeWebhookSecret, verifyWebhookSignature } from '../../../lib/billing/stripe';
import type { StripeSubscription } from '../../../lib/billing/stripe';

export const prerender = false;

interface StripeEvent {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
}

/**
 * Stripe webhook.
 *
 * The success page already claims the licence for the customer who is sitting there watching,
 * so this endpoint exists for everything that happens later: renewals, failed payments and
 * cancellations, plus the case where someone closes the tab before being redirected back.
 */
export const POST: APIRoute = async ({ request }) => {
    const secret = stripeWebhookSecret();
    if (!secret) return json({ ok: false, error: 'Webhook belum dikonfigurasikan.' }, 503);

    // The signature covers the exact bytes sent, so the body must be read raw.
    const raw = await request.text();
    if (!verifyWebhookSignature(raw, request.headers.get('stripe-signature'), secret)) {
        return json({ ok: false, error: 'Tandatangan webhook tidak sah.' }, 400);
    }

    let event: StripeEvent;
    try {
        event = JSON.parse(raw) as StripeEvent;
    } catch {
        return json({ ok: false, error: 'Muatan webhook bukan JSON.' }, 400);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const id = String(event.data.object.id ?? '');
                if (id) await claimSession(id);
                break;
            }
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
            case 'customer.subscription.paused':
            case 'customer.subscription.resumed': {
                await applySubscriptionUpdate(event.data.object as unknown as StripeSubscription);
                break;
            }
            case 'invoice.paid':
            case 'invoice.payment_failed': {
                const subscriptionId = String(event.data.object.subscription ?? '');
                if (subscriptionId) await applySubscriptionUpdate(await retrieveSubscription(subscriptionId));
                break;
            }
            default:
                // Everything else is acknowledged and ignored.
                break;
        }
    } catch (error) {
        // A 500 makes Stripe retry, which is what we want for a transient store failure.
        return json({ ok: false, error: (error as Error).message }, 500);
    }

    return json({ ok: true, received: event.type });
};
