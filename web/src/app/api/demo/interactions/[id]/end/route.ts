/** POST /api/demo/interactions/{id}/end (API_CONTRACTS §6.5): ends the demo interaction through the integration API. */
import { callModule } from "@/core/demo/client";
import { demoRoute, originOf } from "@/core/demo/route";
import { ApiError } from "@/lib/problem";

export const POST = demoRoute({}, async ({ req, params }) => {
  const id = String(params.id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const r = await callModule(originOf(req), `/interactions/${id}/end`, { json: { reason: "COMPLETED" } });
  return { status: r.status, body: r.body, call: r.call };
});
