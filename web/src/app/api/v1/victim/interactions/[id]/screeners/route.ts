/**
 * POST /api/v1/victim/interactions/{id}/screeners (API_CONTRACTS §3.8, FR-SCR-01/02).
 * The safety check is accepted in every mode; other screeners need analysis consent.
 */
import { ScreenerRequest } from "@/contracts/victim";
import { allowsScreeners } from "@/core/consent/mode";
import { runPipeline } from "@/core/pipeline/run";
import { ITEM_BY_CODE, maxValue } from "@/core/screeners/items";
import { turnResponse } from "@/core/victim/respond";
import { requireActive } from "@/core/victim/service";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const POST = route({ auth: "victim", body: ScreenerRequest }, async ({ victim, body }) => {
  const item = ITEM_BY_CODE.get(body.itemCode);
  if (!item || item.instrument !== body.instrument) throw new ApiError("VALIDATION_FAILED", "Unknown question");
  if (!body.skipped && (body.value === null || body.value > maxValue(item))) {
    throw new ApiError("VALIDATION_FAILED", "Answer out of range");
  }
  const interaction = await requireActive(victim.interactionId);
  if (!interaction.consents.length) throw new ApiError("CONSENT_REQUIRED", "Please answer the consent question first.");
  if (item.instrument !== "SAFETY_CHECK" && !allowsScreeners(interaction.mode)) {
    throw new ApiError("CONSENT_REQUIRED", "This question needs your consent.");
  }
  await runPipeline({
    interactionId: victim.interactionId,
    trigger: "SCREENER",
    screener: { instrument: body.instrument, itemCode: body.itemCode, value: body.skipped ? null : body.value, skipped: body.skipped },
  });
  return turnResponse(victim.interactionId);
});
