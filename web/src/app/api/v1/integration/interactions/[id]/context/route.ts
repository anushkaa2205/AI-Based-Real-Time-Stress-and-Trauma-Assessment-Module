/** PUT /api/v1/integration/interactions/{id}/context (task 8.4, §6): same as §3.9 → 200. */
import { ContextRequest } from "@/contracts/interaction";
import { loadOwned } from "@/core/integration/owned";
import { runPipeline } from "@/core/pipeline/run";
import type { CaseContextInput } from "@/core/scoring/context";
import { emergencyPanel } from "@/core/interactions/emergency";
import { route } from "@/lib/route";

export const PUT = route({ auth: "api", scope: "interactions:write", body: ContextRequest }, async ({ client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  const context: CaseContextInput = {
    ...body,
    ...(body.offenceCategory ? { isSexualOffence: body.offenceCategory === "SEXUAL_VIOLENCE" } : {}),
    ...(body.ageGroup ? { isMinor: body.ageGroup === "UNDER_18" } : {}),
  };
  const run = await runPipeline({ interactionId: own.id, trigger: "CONTEXT_UPDATE", context });
  return { showEmergencyPanel: run.showEmergencyPanel, emergency: run.showEmergencyPanel ? emergencyPanel(own.lang) : null };
});
