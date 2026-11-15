/** GET /api/v1/staff/analytics/trends?interval=day|week (task 8.2, §5.8). */
import { AnalyticsQuery } from "@/contracts/staff";
import { trends } from "@/core/analytics/aggregate";
import { loadRows } from "@/core/analytics/query";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "analytics.read", query: AnalyticsQuery }, async ({ user, query }) => {
  const { rows } = await loadRows(user, query);
  return { items: trends(rows, query.interval) };
});
