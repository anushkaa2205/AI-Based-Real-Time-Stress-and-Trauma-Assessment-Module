/**
 * POST /api/demo/interactions/{id}/messages (tasks N.4, P.4; API_CONTRACTS §6.5). One message in the
 * person's own words, sent to `POST /api/v1/integration/…/messages` with the demo key as the person
 * (`sender: VICTIM`). There is no `sender` in the body: only the server records the assistant's
 * questions (P-D4). After the message, the relay asks the module for the next scripted question,
 * records it as an OPERATOR turn and returns its text (not after the Review note).
 * Public: only this browser's own cases; nothing about the assessment leaves (CLAUDE.md rule 1).
 */
import { DemoMessage, type DemoReceipt } from "@/contracts/demo";
import { askNext, openCase, passThrough } from "@/core/demo/assistant";
import { callModule } from "@/core/demo/client";
import { MAX_MESSAGES_PER_CASE, publicDemoRoute } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";
import { ApiError } from "@/lib/problem";
import { Message } from "@/models";

interface MessageReply {
  showEmergencyPanel?: boolean;
  emergency?: DemoReceipt["emergency"];
  code?: string;
}

export const POST = publicDemoRoute({ body: DemoMessage, limit: "message", owned: true }, async ({ req, params, body }) => {
  const id = String(params.id);
  await openCase(id, Date.now());
  const typed = await Message.countDocuments({ interactionId: id, sender: "VICTIM", modality: "TEXT" });
  if (typed >= MAX_MESSAGES_PER_CASE) throw new ApiError("RATE_LIMITED", "This demo case has reached its message limit; press Submit to register it");
  const r = await callModule<MessageReply>(originOf(req), `/interactions/${id}/messages`, { json: { text: body.text, sender: "VICTIM", inputMethod: "TEXT" } });
  if (r.status !== 201 && r.status !== 200) passThrough(r.status, r.body?.code);
  const question = body.note ? null : await askNext(originOf(req), id);
  const receipt: DemoReceipt = {
    ok: true,
    showEmergencyPanel: r.body?.showEmergencyPanel === true,
    emergency: r.body?.showEmergencyPanel ? (r.body.emergency ?? null) : null,
    question,
  };
  return receipt;
});
