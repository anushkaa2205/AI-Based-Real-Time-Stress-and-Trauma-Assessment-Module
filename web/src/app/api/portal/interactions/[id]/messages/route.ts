/**
 * POST /api/portal/interactions/{id}/messages (tasks N.4, P.4; API_CONTRACTS §6.5). One message in the
 * person's own words, sent to `POST /api/v1/integration/…/messages` with the portal key as the person
 * (`sender: VICTIM`). There is no `sender` in the body: only the server records the assistant's
 * questions (P-D4). After the message, the relay asks the module for the next scripted question,
 * records it as an OPERATOR turn and returns its text (not after the Review note).
 * Public: only this browser's own cases; nothing about the assessment leaves (CLAUDE.md rule 1).
 */
import { PortalMessage, type PortalReceipt } from "@/contracts/portal";
import { askNext, openCase, passThrough } from "@/core/portal/assistant";
import { callModule } from "@/core/portal/client";
import { MAX_MESSAGES_PER_CASE, publicPortalRoute } from "@/core/portal/public";
import { originOf } from "@/core/portal/route";
import { ApiError } from "@/lib/problem";
import { Message } from "@/models";

interface MessageReply {
  showEmergencyPanel?: boolean;
  emergency?: PortalReceipt["emergency"];
  code?: string;
}

export const POST = publicPortalRoute({ body: PortalMessage, limit: "message", owned: true }, async ({ req, params, body }) => {
  const id = String(params.id);
  await openCase(id, Date.now());
  const typed = await Message.countDocuments({ interactionId: id, sender: "VICTIM", modality: "TEXT" });
  if (typed >= MAX_MESSAGES_PER_CASE) throw new ApiError("RATE_LIMITED", "This case has reached its message limit; press Submit to register it");
  const r = await callModule<MessageReply>(originOf(req), `/interactions/${id}/messages`, { json: { text: body.text, sender: "VICTIM", inputMethod: "TEXT" } });
  if (r.status !== 201 && r.status !== 200) passThrough(r.status, r.body?.code);
  // The person's message is already recorded; if the next question cannot be read, they can still go on.
  const question = body.note ? null : await askNext(originOf(req), id).catch(() => null);
  const receipt: PortalReceipt = {
    ok: true,
    showEmergencyPanel: r.body?.showEmergencyPanel === true,
    emergency: r.body?.showEmergencyPanel ? (r.body.emergency ?? null) : null,
    question,
  };
  return receipt;
});
