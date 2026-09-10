/**
 * Locale plumbing.
 *
 * The site has no domain yet, so the language lives in the path: Malay at the root and English
 * under /en/. That needs nothing but the file tree, survives a later move to a real domain, and
 * gives each language a URL someone can actually share — which a cookie or a ?lang= switch does
 * not.
 *
 * Slugs are translated too. /en/harga would be a page in English at an address in Malay, and an
 * English reader has no way to guess it. ROUTES is the single place both trees are written down,
 * so the language switcher can map any page onto its counterpart rather than dumping the reader
 * back on the home page.
 */

export const LANGS = ['ms', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'ms';

/** Short label for the switcher, and the full name for its accessible description. */
export const LANG_LABEL: Record<Lang, string> = { ms: 'BM', en: 'EN' };
export const LANG_NAME: Record<Lang, string> = { ms: 'Bahasa Malaysia', en: 'English' };

/** What goes in <html lang> and og:locale. */
export const HTML_LANG: Record<Lang, string> = { ms: 'ms-MY', en: 'en-MY' };
export const OG_LOCALE: Record<Lang, string> = { ms: 'ms_MY', en: 'en_MY' };

/** Every page, and the address each language serves it at. */
export const ROUTES = {
    home: { ms: '/', en: '/en/' },
    apps: { ms: '/apps', en: '/en/apps' },
    nametag: { ms: '/apps/nametag', en: '/en/apps/nametag' },
    pricing: { ms: '/harga', en: '/en/pricing' },
    guide: { ms: '/panduan', en: '/en/guide' },
    account: { ms: '/akaun', en: '/en/account' },
    terms: { ms: '/terma', en: '/en/terms' },
    privacy: { ms: '/privasi', en: '/en/privacy' },
    paymentDone: { ms: '/bayaran/berjaya', en: '/en/payment/success' },
    paymentCancelled: { ms: '/bayaran/batal', en: '/en/payment/cancelled' }
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Reads the language out of a URL. Anything not under /en/ is Malay. */
export function langFromUrl(url: URL): Lang {
    return url.pathname === '/en' || url.pathname.startsWith('/en/') ? 'en' : DEFAULT_LANG;
}

/** Accepts the two-letter code a browser or an API caller sends, falling back to Malay. */
export function toLang(value: unknown): Lang {
    const code = String(value ?? '').slice(0, 2).toLowerCase();
    return (LANGS as readonly string[]).includes(code) ? (code as Lang) : DEFAULT_LANG;
}

/** The address of a page in a given language. */
export function path(key: RouteKey, lang: Lang): string {
    return ROUTES[key][lang];
}

function normalise(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
}

/** Which page a URL is on, or null for anything not in the table. */
export function routeKeyOf(pathname: string): RouteKey | null {
    const here = normalise(pathname);
    for (const key of Object.keys(ROUTES) as RouteKey[]) {
        for (const lang of LANGS) {
            if (normalise(ROUTES[key][lang]) === here) return key;
        }
    }
    return null;
}

/**
 * The same page in the other language.
 *
 * A page outside the table - there are none today, but a future one-off would be - sends the
 * reader to that language's home page rather than to a URL that does not exist.
 */
export function swapLang(pathname: string, to: Lang): string {
    const key = routeKeyOf(pathname);
    return key ? ROUTES[key][to] : ROUTES.home[to];
}

/** True when this nav item is the page being viewed, for aria-current. */
export function isCurrentPath(pathname: string, href: string): boolean {
    const here = normalise(pathname);
    const target = normalise(href);
    return here === target || (target !== '/' && target !== '/en' && here.startsWith(`${target}/`));
}
