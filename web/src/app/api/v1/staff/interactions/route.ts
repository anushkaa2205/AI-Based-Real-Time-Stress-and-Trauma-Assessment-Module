/**
 * GET /api/v1/staff/interactions: live sessions for the operator console (task 7.5, FR-DSH-01).
 * Not in API_CONTRACTS yet (logged for the docs): the console needs a list to pick a call from.
 * Band and SVI only; no content.
 */
import { listScope } from "@/core/policies/rbac";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Case, Interaction, User } from "@/models";

const LIVE_WINDOW_MS = 2 * 3_600_000;

export const GET = route({ auth: "staff", action: "case.list" }, async ({ user }) => {
  const scope = listScope(user, "case.list");
  if (!scope || scope.kind !== "all") throw new ApiError("FORBIDDEN"); // NHAA desk roles only
  const rows = await Interaction.find({ status: "ACTIVE", startedAt: { $gte: new Date(Date.now() - LIVE_WINDOW_MS) } })
    .sort({ startedAt: -1 })
    .limit(50)
    .select("caseId channel uiLanguage startedAt operatorId isPortal")
    .lean();
  const [cases, users] = await Promise.all([
    Case.find({ _id: { $in: rows.map((r) => r.caseId) } })
      .select("docketNumber currentBand currentSvi")
      .lean(),
    User.find({ _id: { $in: rows.map((r) => r.operatorId).filter(Boolean) } })
      .select("name")
      .lean(),
  ]);
  const byCase = new Map(cases.map((c) => [String(c._id), c]));
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return {
    items: rows.map((r) => {
      const c = byCase.get(String(r.caseId));
      return {
        id: String(r._id),
        caseId: String(r.caseId),
        docketNumber: c?.docketNumber ?? "",
        isPortal: r.isPortal === true, // M.7
        channel: r.channel,
        language: r.uiLanguage,
        startedAt: new Date(r.startedAt).toISOString(),
        operator: r.operatorId ? { id: String(r.operatorId), name: names.get(String(r.operatorId)) ?? "?" } : null,
        band: c?.currentBand ?? null,
        svi: c?.currentSvi ?? null,
      };
    }),
  };
});
