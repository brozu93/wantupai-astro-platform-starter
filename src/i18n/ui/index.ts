/**
 * The string table, merged from one module per area.
 *
 * Each module declares Malay as a const object and types English as
 * `Record<keyof typeof ms, string>`, so a key added on one side and forgotten on the other is a
 * type error rather than a Malay sentence appearing on the English site. `npm run typecheck`
 * runs in CI, which makes that guarantee real instead of aspirational.
 */

import type { Lang } from '../index';
import { DEFAULT_LANG } from '../index';
import { common } from './common';
import { pages } from './pages';
import { server } from './server';
import { studio } from './studio';

export const ui = {
    ms: { ...common.ms, ...pages.ms, ...studio.ms, ...server.ms },
    en: { ...common.en, ...pages.en, ...studio.en, ...server.en }
} as const;

export type UiKey = keyof typeof ui.ms;

/** Values substituted into a string's {placeholders}. */
export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: UiKey, vars?: Vars): string {
    const text: string = ui[lang][key] ?? ui[DEFAULT_LANG][key] ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The usual shape: `const t = useTranslations(lang)` then `t('nav.apps')`. */
export function useTranslations(lang: Lang) {
    return (key: UiKey, vars?: Vars) => translate(lang, key, vars);
}

export type Translate = ReturnType<typeof useTranslations>;
