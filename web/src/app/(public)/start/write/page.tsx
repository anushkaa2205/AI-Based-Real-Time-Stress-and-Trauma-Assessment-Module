/** Steps 3 to 5 for writing (plan §6.3): conversation, review, registered. */
import { getTranslations } from "next-intl/server";
import { Journey } from "@/components/portal/journey";

export async function generateMetadata() {
  return { title: (await getTranslations("portal.meta"))("write") };
}

export default function Page() {
  return <Journey mode="LIVE_TEXT" />;
}
