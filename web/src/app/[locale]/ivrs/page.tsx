/** IVRS simulation: keypad-only menu with spoken prompts (task 7.8, FR-CH-05). */
import { getLocale } from "next-intl/server";
import { IvrsScreen } from "@/components/victim/ivrs-screen";

export default async function IvrsPage() {
  const locale = await getLocale();
  return <IvrsScreen initialLang={locale === "hi" ? "hi" : "en"} />;
}
