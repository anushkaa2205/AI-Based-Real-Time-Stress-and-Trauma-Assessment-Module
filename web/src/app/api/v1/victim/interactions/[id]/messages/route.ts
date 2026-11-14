/**
 * POST /api/v1/victim/interactions/{id}/messages (API_CONTRACTS §3.6, task 3.6).
 * Runs the pipeline before replying, so `showEmergencyPanel` reflects this message.
 * Never fails because of the AI (there is no AI call yet; Phase 4 adds it with a fallback).
 */
import { MessageRequest, MessageResponse } from "@/contracts/victim";
import { runPipeline } from "@/core/pipeline/run";
import { emergencyPanel } from "@/core/victim/emergency";
import { currentTurn, requireActive, skipNarrative } from "@/core/victim/service";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

const MAX_TEXT = 2000;

export const POST = route({ auth: "victim", body: MessageRequest }, async ({ req, victim, body }) => {
  const interaction = await requireActive(victim.interactionId);
  // Consent step first (even "no to everything"), so nothing is processed before the notice (AC-CON-01).
  if (!interaction.consents.length) throw new ApiError("CONSENT_REQUIRED", "Please answer the consent question first.");

  let messageId: string | null = null;
  let replayed = false;
  if (body.skipped) {
    await skipNarrative(victim.interactionId);
  } else {
    const text = body.text ?? "";
    if (text.length > MAX_TEXT) throw new ApiError("PAYLOAD_TOO_LARGE");
    const idempotencyKey = req.headers.get("idempotency-key")?.slice(0, 100) || undefined;
    const r = await runPipeline({
      interactionId: victim.interactionId,
      trigger: "TEXT_MESSAGE",
      message: { text, promptKey: body.promptKey, idempotencyKey },
    });
    messageId = r.messageId;
    replayed = r.replayed;
  }

  const turn = await currentTurn(victim.interactionId);
  const payload = MessageResponse.parse({
    messageId,
    reply: turn.prompt,
    showEmergencyPanel: turn.showEmergencyPanel,
    emergency: turn.showEmergencyPanel ? emergencyPanel(turn.lang) : null,
  });
  return Response.json(payload, { headers: replayed ? { "Idempotent-Replay": "true" } : {} });
});
