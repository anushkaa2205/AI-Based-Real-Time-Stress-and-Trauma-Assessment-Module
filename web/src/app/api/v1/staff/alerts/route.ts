/**
 * GET /api/v1/staff/alerts (task 5.6, FR-ALR-01/02, API_CONTRACTS §5.6).
 * Every staff screen polls this every 10 s (the fallback when real time is down),
 * and each call runs due jobs afterwards (task 5.7: escalations, rescoring).
 */
import { after } from "next/server";
import { AlertQuery, decodeCursor, encodeCursor, type AlertItem } from "@/contracts/staff";
import { ESCALATED_LEVEL } from "@/core/cases/resource";
import { runDue } from "@/core/jobs/runDue";
import { listScope } from "@/core/policies/rbac";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Alert, Case } from "@/models";

export const GET = route({ auth: "staff", action: "alert.read", query: AlertQuery }, async ({ user, query }) => {
  after(() => runDue().catch(() => undefined));
  const filter: Record<string, unknown> = { status: query.status };
  if (query.level) filter.level = query.level;
  if (user.role === "DISTRICT_OFFICER") {
    // District officers see alerts once escalated to them, in their district (matrix §4).
    const scope = listScope(user, "alert.read");
    if (!scope || scope.kind !== "district") throw new ApiError("FORBIDDEN");
    filter.escalationLevel = { $gte: ESCALATED_LEVEL };
    filter.caseId = { $in: await Case.distinct("_id", { districtId: scope.districtId }) };
  }
  const offset = decodeCursor(query.cursor);
  const rows = await Alert.find(filter).sort({ level: 1, createdAt: -1 }).skip(offset).limit(query.limit + 1).lean();
  const page = rows.slice(0, query.limit);
  const dockets = new Map(
    (await Case.find({ _id: { $in: page.map((a) => a.caseId) } }).select("docketNumber").lean()).map((c) => [String(c._id), c.docketNumber]),
  );
  const items: AlertItem[] = page.map((a) => ({
    id: String(a._id),
    caseId: String(a.caseId),
    docketNumber: dockets.get(String(a.caseId)) ?? "",
    level: a.level as AlertItem["level"],
    reason: a.reason,
    status: a.status as AlertItem["status"],
    escalationLevel: a.escalationLevel ?? 0,
    createdAt: new Date(a.createdAt).toISOString(),
    acknowledgedAt: a.acknowledgedAt ? new Date(a.acknowledgedAt).toISOString() : null,
  }));
  return { items, nextCursor: rows.length > query.limit ? encodeCursor(offset + query.limit) : null };
});
