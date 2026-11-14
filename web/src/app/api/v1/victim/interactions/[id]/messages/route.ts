/**
 * POST /api/v1/victim/interactions/{id}/messages (API_CONTRACTS §3.6, task 3.6).
 * Runs the pipeline before replying, so `showEmergencyPanel` reflects this message.
 * Never fails because of the AI: if it is down the pipeline scores by rules only (NFR-REL-01).
 * The pipeline checks consent and that the interaction is still active.
 */
import { MessageRequest, MessageResponse } from "@/contracts/victim";
import { runPipeline } from "@/core/pipeline/run";
import { emergencyPanel } from "@/core/victim/emergency";
import { turnAfter } from "@/core/victim/respond";
import { currentTurn, requireActive, skipNarrative } from "@/core/victim/service";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

const MAX_TEXT = 2000;

export const POST = route({ auth: "victim", body: MessageRequest }, async ({ req, victim, body }) => {
  if (body.skipped) {
    const interaction = await requireActive(victim.interactionId);
    if (!interaction.consents.length) throw new ApiError("CONSENT_REQUIRED", "Please answer the consent question first.");
    await skipNarrative(victim.interactionId);
    const turn = await currentTurn(victim.interactionId);
    return MessageResponse.parse({
      messageId: null,
      reply: turn.prompt,
      showEmergencyPanel: turn.showEmergencyPanel,
      emergency: turn.showEmergencyPanel ? emergencyPanel(turn.lang) : null,
    });
  }

  const text = body.text ?? "";
  if (text.length > MAX_TEXT) throw new ApiError("PAYLOAD_TOO_LARGE");
  const idempotencyKey = req.headers.get("idempotency-key")?.slice(0, 100) || undefined;
  const run = await runPipeline({
    interactionId: victim.interactionId,
    trigger: "TEXT_MESSAGE",
    message: { text, promptKey: body.promptKey, idempotencyKey },
  });
  const turn = await turnAfter(victim.interactionId, run);
  const payload = MessageResponse.parse({
    messageId: run.messageId,
    reply: turn.prompt,
    showEmergencyPanel: turn.show,
    emergency: turn.show ? emergencyPanel(turn.lang) : null,
  });
  return Response.json(payload, { headers: run.replayed ? { "Idempotent-Replay": "true" } : {} });
});
