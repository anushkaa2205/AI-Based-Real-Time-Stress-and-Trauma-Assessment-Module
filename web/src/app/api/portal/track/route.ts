/**
 * GET /api/portal/track?docket= (plan §6.4, task N.4). Looks a portal case up through the integration
 * API's status endpoint with the portal key, so a visitor sees only what that contract allows:
 * status, dates and arranged support. Any other docket is the same 404.
 */
import { TrackQuery } from "@/contracts/portal";
import type { CaseStatusResponse } from "@/contracts/integration";
import { callModule } from "@/core/portal/client";
import { publicPortalRoute } from "@/core/portal/public";
import { originOf } from "@/core/portal/route";
import { ApiError } from "@/lib/problem";

export const GET = publicPortalRoute({ query: TrackQuery, limit: "track" }, async ({ req, query }) => {
  const r = await callModule<CaseStatusResponse>(originOf(req), `/cases/${query.docket}/status`, { method: "GET" });
  if (r.status === 404) throw new ApiError("NOT_FOUND", "No portal case found with this number");
  if (r.status !== 200 || !r.body) throw new ApiError("ANALYSIS_DEGRADED", "The case could not be looked up");
  const { docketNumber, status, registeredAt, updatedAt, support } = r.body;
  return { docketNumber, status, registeredAt, updatedAt, support };
});
