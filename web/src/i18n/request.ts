/**
 * next-intl request config (Phase P, task P.5; NIVARA_FLOW_AND_UI_PLAN.md §6.7). Reads the site
 * language from the NEXT_LOCALE cookie and serves that language's messages/*.json. No URL prefix.
 * `core/i18n/messages.ts` keeps serving the module's own server-side text.
 */
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { MESSAGES } from "@/core/i18n/messages";
import { LOCALE_COOKIE, siteLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = siteLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: MESSAGES[locale], timeZone: "Asia/Kolkata" };
});
