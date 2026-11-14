/** next-intl request config (task 3.8): the [locale] segment, or English outside it. */
import { getRequestConfig } from "next-intl/server";
import { VICTIM_LANGS, type VictimLang } from "@/contracts/victim";
import { MESSAGES } from "@/core/i18n/messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: VictimLang = (VICTIM_LANGS as readonly string[]).includes(requested ?? "") ? (requested as VictimLang) : "en";
  return { locale, messages: MESSAGES[locale], timeZone: "Asia/Kolkata" };
});
