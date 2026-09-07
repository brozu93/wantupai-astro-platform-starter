import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A very small Stripe client built on fetch.
 *
 * Only four calls are needed - create a Checkout Session, read one back, read a subscription,
 * and verify a webhook signature - so the SDK would be a large dependency for very little.
 */

const API = 'https://api.stripe.com/v1';

export function stripeSecretKey(): string | undefined {
    return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
}

export function stripeWebhookSecret(): string | undefined {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}

/** True when real payments are configured. Without this the app runs in demo mode. */
export function paymentsConfigured(): boolean {
    return Boolean(stripeSecretKey());
}

export class StripeError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

/** Flattens nested values into Stripe's bracketed form encoding. */
function encode(params: Record<string, unknown>, target = new URLSearchParams(), prefix = ''): URLSearchParams {
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        const name = prefix ? `${prefix}[${key}]` : key;
        if (Array.isArray(value)) {
            value.forEach((item, i) => {
                if (typeof item === 'object' && item !== null) encode(item as Record<string, unknown>, target, `${name}[${i}]`);
                else target.append(`${name}[${i}]`, String(item));
            });
        } else if (typeof value === 'object') {
            encode(value as Record<string, unknown>, target, name);
        } else {
            target.append(name, String(value));
        }
    }
    return target;
}

async function request<T>(path: string, init: { method: 'GET' | 'POST'; body?: Record<string, unknown> }): Promise<T> {
    const key = stripeSecretKey();
    if (!key) throw new StripeError('Stripe belum dikonfigurasikan.', 500);

    const response = await fetch(`${API}${path}`, {
        method: init.method,
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: init.body ? encode(init.body).toString() : undefined
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
        throw new StripeError(payload.error?.message ?? `Stripe menolak permintaan (${response.status}).`, response.status);
    }
    return payload as T;
}

export interface CheckoutSession {
    id: string;
    url?: string;
    status?: string;
    payment_status?: string;
    mode?: string;
    customer?: string | { id: string };
    customer_details?: { email?: string };
    customer_email?: string;
    subscription?: string | StripeSubscription;
    metadata?: Record<string, string>;
}

export interface StripeSubscription {
    id: string;
    status: string;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
    customer?: string | { id: string };
    items?: { data?: Array<{ current_period_end?: number }> };
    metadata?: Record<string, string>;
}

export function createCheckoutSession(input: {
    mode: 'payment' | 'subscription';
    amount: number;
    currency: string;
    productName: string;
    productDescription: string;
    successUrl: string;
    cancelUrl: string;
    email?: string;
    metadata: Record<string, string>;
}): Promise<CheckoutSession> {
    const price: Record<string, unknown> = {
        currency: input.currency,
        unit_amount: input.amount,
        product_data: { name: input.productName, description: input.productDescription }
    };
    if (input.mode === 'subscription') price.recurring = { interval: 'month' };

    return request<CheckoutSession>('/checkout/sessions', {
        method: 'POST',
        body: {
            mode: input.mode,
            line_items: [{ quantity: 1, price_data: price }],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            customer_email: input.email,
            metadata: input.metadata,
            // Copy the metadata onto the subscription too, so webhook events can be traced back.
            ...(input.mode === 'subscription' ? { subscription_data: { metadata: input.metadata } } : {})
        }
    });
}

export function retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
    return request<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`, { method: 'GET' });
}

export function retrieveSubscription(id: string): Promise<StripeSubscription> {
    return request<StripeSubscription>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'GET' });
}

/** Stripe has moved the period end between the subscription and its items; accept either. */
export function subscriptionPeriodEnd(subscription: StripeSubscription): string {
    const seconds = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
    if (!seconds) {
        // Fall back to a month out rather than locking a paying customer out.
        return new Date(Date.now() + 31 * 86_400_000).toISOString();
    }
    return new Date(seconds * 1000).toISOString();
}

/**
 * Verifies the `Stripe-Signature` header against the raw request body.
 *
 * Stripe signs `${timestamp}.${body}` with HMAC-SHA256. The timestamp is checked as well, so
 * a captured webhook cannot be replayed later.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300): boolean {
    if (!header) return false;

    let timestamp = '';
    const signatures: string[] = [];
    for (const part of header.split(',')) {
        const [key, value] = part.split('=', 2);
        if (key?.trim() === 't') timestamp = value?.trim() ?? '';
        if (key?.trim() === 'v1' && value) signatures.push(value.trim());
    }
    if (!timestamp || signatures.length === 0) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) return false;

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    return signatures.some((signature) => {
        const candidate = Buffer.from(signature);
        return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
    });
}

export function customerId(value: CheckoutSession['customer'] | StripeSubscription['customer']): string | undefined {
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.id;
}
