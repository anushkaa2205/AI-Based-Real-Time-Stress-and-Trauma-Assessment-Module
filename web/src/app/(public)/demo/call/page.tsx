/** Demo input 2, speak (plan §6.3). Public; off (404) unless DEMO_ENABLED. A signed-in supervisor may take the line over (§7). */
import { notFound } from "next/navigation";
import { LiveCallDemo } from "@/components/demo/live-call-demo";
import { demoEnabled } from "@/core/demo/client";
import { listDistricts } from "@/core/demo/districts";
import { access } from "@/core/policies/rbac";
import { currentStaff } from "@/lib/staff-session";

export const metadata = { title: "Speak" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!demoEnabled()) notFound();
  const user = await currentStaff();
  return <LiveCallDemo districts={await listDistricts()} canTakeOver={!!user && !!access(user, "demo.use")} />;
}
