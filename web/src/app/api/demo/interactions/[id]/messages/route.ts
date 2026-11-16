/**
 * POST /api/demo/interactions/{id}/messages (API_CONTRACTS §6.5, task M.11). One chat message,
 * from the person or from NHAA's simulated chatbot, sent to `POST /api/v1/integration/…/messages`
 * with the demo key. The module's status and body come back unchanged, with the request id and time.
 */
import { DemoMessage } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { demoRoute, originOf } from "@/core/demo/route";
import { ApiError } from "@/lib/problem";

export const POST = demoRoute({ body: DemoMessage }, async ({ req, params, body }) => {
  const id = String(params.id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const r = await callModule(originOf(req), `/interactions/${id}/messages`, { json: { text: body.text, sender: body.sender, inputMethod: "TEXT" } });
  return { status: r.status, body: r.body, call: r.call };
});
