/**
 * POST /api/v1/integration/interactions/{id}/messages (task 8.4, §6): `{ text, sender }` → 201.
 * VICTIM text goes through the same pipeline as §3.6 (safety lexicon always, AI with consent).
 * OPERATOR text is kept in the transcript (encrypted) but not scored: it is not the person's words.
 */
import { IntegrationMessage } from "@/contracts/integration";
import { loadOwned } from "@/core/integration/owned";
import { runPipeline } from "@/core/pipeline/run";
import { encrypt } from "@/core/privacy/crypto";
import { emergencyPanel } from "@/core/victim/emergency";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Interaction, Message } from "@/models";

export const POST = route({ auth: "api", scope: "interactions:write", body: IntegrationMessage }, async ({ req, client, params, body }) => {
  const own = await loadOwned(String(params.id), client.id);
  if (own.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  const idempotencyKey = req.headers.get("idempotency-key")?.slice(0, 100) || undefined;

  if (body.sender === "OPERATOR") {
    const i = await Interaction.findOneAndUpdate({ _id: own.id, status: "ACTIVE" }, { $inc: { messageSeq: 1 } }, { returnDocument: "after" }).select("messageSeq").lean();
    if (!i) throw new ApiError("INTERACTION_ENDED");
    const m = await Message.create({ interactionId: own.id, seq: i.messageSeq, sender: "OPERATOR", modality: "TEXT", textEnc: encrypt(body.text), idempotencyKey });
    return Response.json({ messageId: String(m._id), showEmergencyPanel: false, emergency: null }, { status: 201 });
  }

  const run = await runPipeline({ interactionId: own.id, trigger: "TEXT_MESSAGE", message: { text: body.text, idempotencyKey } });
  return Response.json(
    { messageId: run.messageId, showEmergencyPanel: run.showEmergencyPanel, emergency: run.showEmergencyPanel ? emergencyPanel(own.lang) : null },
    { status: run.replayed ? 200 : 201, headers: run.replayed ? { "Idempotent-Replay": "true" } : {} },
  );
});
