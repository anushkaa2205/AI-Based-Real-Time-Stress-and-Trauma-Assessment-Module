/** POST /api/portal/interactions/{id}/end (task N.4): ends the case and reveals its docket number (plan §6.3 step 3). */
import { callModule } from "@/core/portal/client";
import { publicPortalRoute } from "@/core/portal/public";
import { originOf } from "@/core/portal/route";
import { ApiError } from "@/lib/problem";

export const POST = publicPortalRoute({ limit: "other", owned: true }, async ({ req, params }) => {
  const r = await callModule<{ docketNumber?: string }>(originOf(req), `/interactions/${String(params.id)}/end`, { json: { reason: "COMPLETED" } });
  if (r.status !== 200 || !r.body?.docketNumber) throw new ApiError("ANALYSIS_DEGRADED", "The case could not be closed");
  return { docketNumber: r.body.docketNumber };
});
