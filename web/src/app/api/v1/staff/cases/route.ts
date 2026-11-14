/** GET /api/v1/staff/cases: risk-sorted queue (API_CONTRACTS §5.2, FR-CASE-01). */
import { CaseQueueQuery } from "@/contracts/staff";
import { caseQueue } from "@/core/cases/queue";
import { listScope } from "@/core/policies/rbac";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "case.list", query: CaseQueueQuery }, async ({ user, query }) => {
  const scope = listScope(user, "case.list");
  if (!scope) throw new ApiError("FORBIDDEN");
  return caseQueue(user, scope, query);
});
