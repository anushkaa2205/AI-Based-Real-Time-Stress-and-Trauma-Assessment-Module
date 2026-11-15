/** GET /api/v1/staff/analytics/capacity (task 8.2, §5.8, EO-4): referral demand vs completion by district and type. */
import { AnalyticsQuery } from "@/contracts/staff";
import { capacity } from "@/core/analytics/aggregate";
import { districtNames, loadRows } from "@/core/analytics/query";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "analytics.read", query: AnalyticsQuery }, async ({ user, query }) => {
  const { rows } = await loadRows(user, query);
  const items = capacity(rows);
  const names = await districtNames([...new Set(items.map((i) => i.districtId))]);
  return { items: items.map((i) => ({ ...i, districtName: names.get(i.districtId) ?? "Unknown" })) };
});
