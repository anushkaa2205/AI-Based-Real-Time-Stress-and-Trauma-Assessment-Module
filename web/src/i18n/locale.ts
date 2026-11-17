/**
 * The site language (Phase P, P-D7, FR-LANG-07; NIVARA_FLOW_AND_UI_PLAN.md §6.7). English by default.
 * The choice lives in the NEXT_LOCALE cookie (one year), with no language prefix in the URL, and
 * switches the whole website: public pages, login and staff portals. Browser-safe: no server imports.
 */
import { toVictimLang, VICTIM_LANGS, type VictimLang } from "@/contracts/interaction";

export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
export const DEFAULT_LOCALE: VictimLang = "en";
export const SITE_LOCALES = VICTIM_LANGS;

/** Any cookie value to a supported language; unknown or missing → English. */
export function siteLocale(value: string | undefined | null): VictimLang {
  return toVictimLang(value ?? DEFAULT_LOCALE);
}

/** The cookie a browser sets when the person picks a language. */
export function localeCookie(lang: VictimLang): string {
  return `${LOCALE_COOKIE}=${lang}; Path=/; Max-Age=${LOCALE_MAX_AGE_SEC}; SameSite=Lax`;
}
