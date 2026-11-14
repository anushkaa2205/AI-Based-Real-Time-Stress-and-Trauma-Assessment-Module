/**
 * PUT /api/v1/victim/interactions/{id}/context (API_CONTRACTS §3.9, FR-CH-08).
 * Every field optional; an empty body skips the step. No caste field exists (rule 10).
 */
import { ContextRequest } from "@/contracts/victim";
import { runPipeline } from "@/core/pipeline/run";
import type { CaseContextInput } from "@/core/scoring/context";
import { turnResponse } from "@/core/victim/respond";
import { requireActive } from "@/core/victim/service";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const PUT = route({ auth: "victim", body: ContextRequest }, async ({ victim, body }) => {
  const interaction = await requireActive(victim.interactionId);
  if (!interaction.consents.length) throw new ApiError("CONSENT_REQUIRED", "Please answer the consent question first.");
  const context: CaseContextInput = {
    ...body,
    ...(body.offenceCategory ? { isSexualOffence: body.offenceCategory === "SEXUAL_VIOLENCE" } : {}),
    ...(body.ageGroup ? { isMinor: body.ageGroup === "UNDER_18" } : {}),
  };
  await runPipeline({ interactionId: victim.interactionId, trigger: "CONTEXT_UPDATE", context });
  return turnResponse(victim.interactionId);
});
