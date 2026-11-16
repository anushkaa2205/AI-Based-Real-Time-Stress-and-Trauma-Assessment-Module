/** POST /api/demo/interactions/{id}/end (task N.4): ends the case and reveals its docket number (plan §6.3 step 3). */
import { callModule } from "@/core/demo/client";
import { publicDemoRoute } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";
import { ApiError } from "@/lib/problem";

export const POST = publicDemoRoute({ limit: "other", owned: true }, async ({ req, params }) => {
  const r = await callModule<{ docketNumber?: string }>(originOf(req), `/interactions/${String(params.id)}/end`, { json: { reason: "COMPLETED" } });
  if (r.status !== 200 || !r.body?.docketNumber) throw new ApiError("ANALYSIS_DEGRADED", "The case could not be closed");
  return { docketNumber: r.body.docketNumber };
});
