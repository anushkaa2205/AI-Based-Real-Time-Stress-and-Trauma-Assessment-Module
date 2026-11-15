/**
 * Where the victim intake pages live: /portal/<locale>/… (start, consent, chat, keypad).
 * The public home page at / leads here (FRONTEND_UX_PRODUCT_BRIEF.md §2.1, task F.2).
 */
import { VICTIM_LANGS, type VictimLang } from "@/contracts/victim";

export const PORTAL = "/portal";

/** `/portal/<locale>` plus an optional sub-path such as "/consent?i=…". */
export function portalPath(locale: string, sub = ""): string {
  return `${PORTAL}/${locale}${sub}`;
}

/** A language code from a query string, or English. Anything unknown is ignored. */
export function parseLang(value: string | string[] | null | undefined): VictimLang {
  const v = Array.isArray(value) ? value[0] : value;
  return (VICTIM_LANGS as readonly string[]).includes(v ?? "") ? (v as VictimLang) : "en";
}

/** A public page (/, /how-it-works, /privacy) in a language: `?lang=` only when it is not English. */
export function publicPath(lang: VictimLang, path = "/", hash = ""): string {
  return `${path}${lang === "en" ? "" : `?lang=${lang}`}${hash}`;
}

/**
 * How the person chose to share on the homepage (brief §2.2 C). A non-sensitive hint only:
 * it decides which control the story step shows first and never reaches the server.
 */
export const WAYS = ["write", "speak", "guided"] as const;
export type Way = (typeof WAYS)[number];

export function parseWay(value: string | null | undefined): Way | null {
  return (WAYS as readonly string[]).includes(value ?? "") ? (value as Way) : null;
}

/** Appends `way=` to a portal path that may already have a query string. */
export function withWay(path: string, way: Way | null): string {
  if (!way) return path;
  return `${path}${path.includes("?") ? "&" : "?"}way=${way}`;
}
