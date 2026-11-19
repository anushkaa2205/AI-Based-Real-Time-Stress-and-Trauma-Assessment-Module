/** Steps 1 and 2 of the portal journey (plan §6.3): Before we begin, then How to share. A signed-in supervisor may take the live line over (§7). */
import { getTranslations } from "next-intl/server";
import { StartJourney } from "@/components/portal/start-journey";
import { listDistricts } from "@/core/portal/districts";
import { access } from "@/core/policies/rbac";
import { currentStaff } from "@/lib/staff-session";

export async function generateMetadata() {
  return { title: (await getTranslations("portal.meta"))("start") };
}

export default async function Page() {
  const user = await currentStaff();
  return <StartJourney districts={await listDistricts()} canTakeOver={!!user && !!access(user, "portal.takeover")} />;
}
