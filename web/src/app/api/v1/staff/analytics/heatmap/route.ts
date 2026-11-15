/** GET /api/v1/staff/analytics/heatmap (task 8.2, §5.8): High/Critical per 1000 by district; small districts suppressed. */
import { AnalyticsQuery } from "@/contracts/staff";
import { heatmap } from "@/core/analytics/aggregate";
import { districtNames, loadRows } from "@/core/analytics/query";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "analytics.read", query: AnalyticsQuery }, async ({ user, query }) => {
  const { rows } = await loadRows(user, query);
  const names = await districtNames([...new Set(rows.map((r) => r.districtId).filter((x): x is string => !!x))]);
  return { items: heatmap(rows, names) };
});
