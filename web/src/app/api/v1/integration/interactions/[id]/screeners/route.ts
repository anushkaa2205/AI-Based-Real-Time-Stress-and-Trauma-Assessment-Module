/** POST /api/v1/integration/interactions/{id}/screeners (task 8.4, §6): same as §3.8 → 201. */
import { ScreenerRequest } from "@/contracts/victim";
import { loadOwned } from "@/core/integration/owned";
import { runPipeline } from "@/core/pipeline/run";
import { ITEM_BY_CODE, maxValue } from "@/core/screeners/items";
import { emergencyPanel } from "@/core/victim/emergency";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: ScreenerRequest }, async ({ client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  const item = ITEM_BY_CODE.get(body.itemCode);
  if (!item || item.instrument !== body.instrument) throw new ApiError("VALIDATION_FAILED", "Unknown question");
  if (!body.skipped && (body.value === null || body.value > maxValue(item))) throw new ApiError("VALIDATION_FAILED", "Answer out of range");
  const run = await runPipeline({
    interactionId: own.id,
    trigger: "SCREENER",
    screener: { instrument: body.instrument, itemCode: body.itemCode, value: body.skipped ? null : body.value, skipped: body.skipped },
  });
  return Response.json({ showEmergencyPanel: run.showEmergencyPanel, emergency: run.showEmergencyPanel ? emergencyPanel(own.lang) : null }, { status: 201 });
});
