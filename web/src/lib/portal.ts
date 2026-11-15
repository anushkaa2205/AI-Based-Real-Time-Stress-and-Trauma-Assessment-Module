/**
 * Where the victim intake pages live: /portal/<locale>/… (start, consent, chat, keypad).
 * The public home page at / leads here (FRONTEND_UX_PRODUCT_BRIEF.md §2.1).
 */
export const PORTAL = "/portal";

/** `/portal/<locale>` plus an optional sub-path such as "/consent?i=…". */
export function portalPath(locale: string, sub = ""): string {
  return `${PORTAL}/${locale}${sub}`;
}
