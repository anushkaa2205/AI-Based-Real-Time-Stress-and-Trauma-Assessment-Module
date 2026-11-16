/** Analytics for supervisors, district officers, state and ministry admins (task 8.3, FR-DSH-06). Anonymised only. */
import { AnalyticsDashboard } from "@/components/staff/analytics-dashboard";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  const user = await requirePage("analytics");
  const title = user.role === "MINISTRY_ADMIN" ? "National analytics" : user.role === "STATE_ADMIN" ? "State analytics" : user.role === "DISTRICT_OFFICER" ? "District analytics" : "Analytics";
  return (
    <section className="flex flex-col gap-4">
      <h1 className="page-title">{title}</h1>
      <AnalyticsDashboard fixedDistrict={user.role === "DISTRICT_OFFICER"} />
    </section>
  );
}
