import { randomBytes } from 'node:crypto';
import type { PlanId } from './plans';
import { getStore } from './store';

const STORE_NAME = 'kakas-licences';
/** Generations allowed per licence per day, to keep an abusive key from burning the budget. */
const DAILY_LIMIT = 400;

export interface SubscriptionState {
    status: 'active' | 'past_due' | 'canceled';
    /** ISO timestamp; access is granted up to this moment even after a cancellation. */
    currentPeriodEnd: string;
    stripeSubscriptionId?: string;
}

export interface Licence {
    key: string;
    email: string;
    plan: PlanId;
    createdAt: string;
    /** Remaining one-off design credits. Ignored while a subscription is active. */
    credits: number;
    subscription?: SubscriptionState;
    stripeCustomerId?: string;
    /** Issued without a real payment, in demo mode. */
    demo?: boolean;
    /** Spec hashes already paid for, so the same design re-downloads for free. */
    designs: Record<string, { firstAt: string; downloads: number }>;
    usage: { date: string; count: number };
}

/**
 * Licence keys read aloud over the phone and get typed by hand, so they avoid the characters
 * people confuse: no 0/O, no 1/I. Five groups of four gives ~103 bits of entropy.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLicenceKey(): string {
    const bytes = randomBytes(20);
    let out = '';
    for (let i = 0; i < 20; i++) {
        if (i > 0 && i % 4 === 0) out += '-';
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return `KKS-${out}`;
}

/** Accepts the key in any case and with missing dashes, as customers usually type it. */
export function normaliseLicenceKey(input: string): string {
    const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = cleaned.startsWith('KKS') ? cleaned.slice(3) : cleaned;
    if (body.length !== 20) return '';
    return `KKS-${body.replace(/(.{4})(?=.)/g, '$1-')}`;
}

export function isSubscriptionActive(licence: Licence, now = new Date()): boolean {
    const sub = licence.subscription;
    if (!sub) return false;
    if (sub.status === 'active') return true;
    // A cancelled subscription still runs to the end of the period that was paid for.
    return new Date(sub.currentPeriodEnd).getTime() > now.getTime();
}

export interface Entitlement {
    allowed: boolean;
    reason?: string;
    /** True when this design was already paid for and costs nothing to fetch again. */
    repeat: boolean;
    /** True when generating will consume a credit. */
    consumesCredit: boolean;
}

export function checkEntitlement(licence: Licence, specHash: string, now = new Date()): Entitlement {
    const today = now.toISOString().slice(0, 10);
    if (licence.usage.date === today && licence.usage.count >= DAILY_LIMIT) {
        return { allowed: false, reason: 'Had harian lesen ini telah dicapai. Cuba semula esok.', repeat: false, consumesCredit: false };
    }

    if (licence.designs[specHash]) return { allowed: true, repeat: true, consumesCredit: false };
    if (isSubscriptionActive(licence, now)) return { allowed: true, repeat: false, consumesCredit: false };
    if (licence.credits > 0) return { allowed: true, repeat: false, consumesCredit: true };

    return {
        allowed: false,
        reason:
            licence.plan === 'bulanan'
                ? 'Langganan ini sudah tamat. Perbaharui untuk terus menjana STL.'
                : 'Kredit lesen ini sudah habis. Beli kredit baharu atau langgan bulanan.',
        repeat: false,
        consumesCredit: false
    };
}

export async function readLicence(key: string): Promise<Licence | null> {
    const normalised = normaliseLicenceKey(key);
    if (!normalised) return null;
    const store = await getStore(STORE_NAME);
    return store.get<Licence>(normalised);
}

export async function writeLicence(licence: Licence): Promise<void> {
    const store = await getStore(STORE_NAME);
    await store.set(licence.key, licence);
}

export async function createLicence(input: {
    email: string;
    plan: PlanId;
    credits: number;
    subscription?: SubscriptionState;
    stripeCustomerId?: string;
    demo?: boolean;
}): Promise<Licence> {
    const licence: Licence = {
        key: generateLicenceKey(),
        email: input.email,
        plan: input.plan,
        createdAt: new Date().toISOString(),
        credits: input.credits,
        subscription: input.subscription,
        stripeCustomerId: input.stripeCustomerId,
        demo: input.demo,
        designs: {},
        usage: { date: new Date().toISOString().slice(0, 10), count: 0 }
    };
    await writeLicence(licence);
    return licence;
}

/** Records one generation against the licence, spending a credit when the design is new. */
export async function recordGeneration(licence: Licence, specHash: string, consumesCredit: boolean): Promise<Licence> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = licence.designs[specHash];

    const updated: Licence = {
        ...licence,
        credits: consumesCredit ? Math.max(0, licence.credits - 1) : licence.credits,
        designs: {
            ...licence.designs,
            [specHash]: {
                firstAt: existing?.firstAt ?? new Date().toISOString(),
                downloads: (existing?.downloads ?? 0) + 1
            }
        },
        usage: licence.usage.date === today ? { date: today, count: licence.usage.count + 1 } : { date: today, count: 1 }
    };

    await writeLicence(updated);
    return updated;
}

/** Records a whole batch in one write, instead of one store round trip per tag. */
export async function recordBatch(licence: Licence, specHashes: string[]): Promise<Licence> {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const designs = { ...licence.designs };
    for (const hash of specHashes) {
        const existing = designs[hash];
        designs[hash] = { firstAt: existing?.firstAt ?? now, downloads: (existing?.downloads ?? 0) + 1 };
    }

    const updated: Licence = {
        ...licence,
        designs,
        usage:
            licence.usage.date === today
                ? { date: today, count: licence.usage.count + specHashes.length }
                : { date: today, count: specHashes.length }
    };
    await writeLicence(updated);
    return updated;
}

/** Adds credits to an existing licence, used when someone buys a second one-off pack. */
export async function addCredits(licence: Licence, credits: number): Promise<Licence> {
    const updated = { ...licence, credits: licence.credits + credits };
    await writeLicence(updated);
    return updated;
}

/** The shape sent to the browser: never includes anything the customer should not see. */
export function publicLicence(licence: Licence, now = new Date()) {
    return {
        key: licence.key,
        plan: licence.plan,
        email: maskEmail(licence.email),
        credits: licence.credits,
        unlimited: isSubscriptionActive(licence, now),
        subscription: licence.subscription ? { status: licence.subscription.status, currentPeriodEnd: licence.subscription.currentPeriodEnd } : null,
        designs: Object.keys(licence.designs).length,
        demo: licence.demo === true,
        createdAt: licence.createdAt
    };
}

function maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    const visible = user.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export { STORE_NAME as LICENCE_STORE, DAILY_LIMIT };
