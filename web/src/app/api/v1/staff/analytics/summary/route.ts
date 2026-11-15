/** GET /api/v1/staff/analytics/summary (task 8.2, API_CONTRACTS §5.8): anonymised; cells under 5 suppressed. */
import { AnalyticsQuery } from "@/contracts/staff";
import { summarise } from "@/core/analytics/aggregate";
import { loadRows } from "@/core/analytics/query";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "analytics.read", query: AnalyticsQuery }, async ({ user, query }) => {
  const { rows, scope } = await loadRows(user, query);
  return { ...summarise(rows), from: scope.from.toISOString().slice(0, 10), to: new Date(scope.to.getTime() - 1).toISOString().slice(0, 10) };
});
