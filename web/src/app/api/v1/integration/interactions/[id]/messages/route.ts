/**
 * POST /api/v1/integration/interactions/{id}/messages (task 8.4, API_CONTRACTS §6.2): `{ text, sender }` → 201.
 * VICTIM text goes through the pipeline (safety lexicon always, AI with consent), read with the
 * operator turn just before it (FR-NLP-11). OPERATOR text is kept in the transcript (encrypted) but
 * never scored: it is not the person's words (FR-CH-02).
 */
import { IntegrationMessage } from "@/contracts/integration";
import { loadOwned } from "@/core/integration/owned";
import { emergencyPanel } from "@/core/interactions/emergency";
import { addOperatorTurn } from "@/core/interactions/service";
import { runPipeline } from "@/core/pipeline/run";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

export const POST = route({ auth: "api", scope: "interactions:write", body: IntegrationMessage }, async ({ req, client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  if (own.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  const idempotencyKey = req.headers.get("idempotency-key")?.slice(0, 100) || undefined;

  if (body.sender === "OPERATOR") {
    const messageId = await addOperatorTurn(own.id, body.text, { idempotencyKey });
    return Response.json({ messageId, showEmergencyPanel: false, emergency: null }, { status: 201 });
  }

  const run = await runPipeline({ interactionId: own.id, trigger: "TEXT_MESSAGE", message: { text: body.text, idempotencyKey } });
  return Response.json(
    { messageId: run.messageId, showEmergencyPanel: run.showEmergencyPanel, emergency: run.showEmergencyPanel ? emergencyPanel(own.lang) : null },
    { status: run.replayed ? 200 : 201, headers: run.replayed ? { "Idempotent-Replay": "true" } : {} },
  );
});
