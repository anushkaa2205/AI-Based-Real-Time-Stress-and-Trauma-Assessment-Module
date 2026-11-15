/**
 * GET /api/v1/staff/analytics/export.csv (task 8.3 (C), FR-DSH-08): the anonymised summary as CSV.
 * Same suppression as the screen: suppressed cells are written as "<5".
 */
import { AnalyticsQuery } from "@/contracts/staff";
import { summarise, type Suppressed } from "@/core/analytics/aggregate";
import { loadRows } from "@/core/analytics/query";
import { route } from "@/lib/route";

const cell = (s: Suppressed<number | null>) => (s.suppressed ? "<5" : s.value === null ? "" : String(s.value));

export const GET = route({ auth: "staff", action: "analytics.read", query: AnalyticsQuery }, async ({ user, query }) => {
  const { rows, scope } = await loadRows(user, query);
  const s = summarise(rows);
  const lines: [string, string][] = [
    ["from", scope.from.toISOString().slice(0, 10)],
    ["to", new Date(scope.to.getTime() - 1).toISOString().slice(0, 10)],
    ["interactions", cell(s.interactions)],
    ["band_low", cell(s.byBand.LOW)],
    ["band_moderate", cell(s.byBand.MODERATE)],
    ["band_high", cell(s.byBand.HIGH)],
    ["band_critical", cell(s.byBand.CRITICAL)],
    ["critical_alerts", cell(s.criticalAlerts)],
    ["median_ack_sec", cell(s.medianAckSec)],
    ["median_first_response_sec", cell(s.medianFirstResponseSec)],
    ["referrals_created", cell(s.referralsCreated)],
    ["referrals_done", cell(s.referralsDone)],
    ["sla_breaches", cell(s.slaBreaches)],
  ];
  const csv = ["metric,value", ...lines.map(([k, v]) => `${k},${v}`)].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="nhaa-analytics-summary.csv"', "cache-control": "no-store" },
  });
});
