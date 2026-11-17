/** Steps 3 to 5 for speaking (plan §6.3): turn by turn, then review and registered. */
import { getTranslations } from "next-intl/server";
import { Journey } from "@/components/portal/journey";

export async function generateMetadata() {
  return { title: (await getTranslations("portal.meta"))("speak") };
}

export default function Page() {
  return <Journey mode="LIVE_AUDIO" />;
}
