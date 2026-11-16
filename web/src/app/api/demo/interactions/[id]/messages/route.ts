/**
 * POST /api/demo/interactions/{id}/messages (task N.4). One chat message, from the person or from
 * NHAA's simulated chatbot, sent to `POST /api/v1/integration/…/messages` with the demo key.
 * Public: only this browser's own cases; the reply says "received" and carries the one risk
 * signal a person may see, the emergency panel (CLAUDE.md rule 1). Nothing else leaves.
 */
import { DemoMessage, type DemoReceipt } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { MAX_MESSAGES_PER_CASE, publicDemoRoute } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";
import { ApiError, type ErrorCode } from "@/lib/problem";
import { Message } from "@/models";

interface MessageReply {
  showEmergencyPanel?: boolean;
  emergency?: DemoReceipt["emergency"];
  code?: string;
}

/** The module's refusals that a page can act on; anything else is reported as degraded. */
export function passThrough(status: number, code: string | undefined): never {
  if (status === 409 && (code === "CONSENT_REQUIRED" || code === "INTERACTION_ENDED")) throw new ApiError(code as ErrorCode);
  if (status === 404) throw new ApiError("NOT_FOUND");
  throw new ApiError("ANALYSIS_DEGRADED", "The module could not take this input");
}

export const POST = publicDemoRoute({ body: DemoMessage, limit: "message", owned: true }, async ({ req, params, body }) => {
  const id = String(params.id);
  if ((await Message.countDocuments({ interactionId: id })) >= MAX_MESSAGES_PER_CASE) throw new ApiError("RATE_LIMITED", "This demo case has reached its message limit; finish it and file another");
  const r = await callModule<MessageReply>(originOf(req), `/interactions/${id}/messages`, { json: { text: body.text, sender: body.sender, inputMethod: "TEXT" } });
  if (r.status !== 201) passThrough(r.status, r.body?.code);
  const receipt: DemoReceipt = { ok: true, showEmergencyPanel: r.body?.showEmergencyPanel === true, emergency: r.body?.showEmergencyPanel ? (r.body.emergency ?? null) : null };
  return receipt;
});
