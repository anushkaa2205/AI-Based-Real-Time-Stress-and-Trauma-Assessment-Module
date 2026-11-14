/**
 * PUT /api/v1/victim/interactions/{id}/context (API_CONTRACTS §3.9, FR-CH-08).
 * Every field optional; an empty body skips the step. No caste field exists (rule 10).
 * The pipeline checks consent and that the interaction is still active.
 */
import { ContextRequest } from "@/contracts/victim";
import { runPipeline } from "@/core/pipeline/run";
import type { CaseContextInput } from "@/core/scoring/context";
import { turnResponse } from "@/core/victim/respond";
import { route } from "@/lib/route";

export const PUT = route({ auth: "victim", body: ContextRequest }, async ({ victim, body }) => {
  const context: CaseContextInput = {
    ...body,
    ...(body.offenceCategory ? { isSexualOffence: body.offenceCategory === "SEXUAL_VIOLENCE" } : {}),
    ...(body.ageGroup ? { isMinor: body.ageGroup === "UNDER_18" } : {}),
  };
  const run = await runPipeline({ interactionId: victim.interactionId, trigger: "CONTEXT_UPDATE", context });
  return turnResponse(victim.interactionId, run);
});
