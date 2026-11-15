/**
 * POST /api/v1/staff/interactions/{id}/operator-message (API_CONTRACTS §5.3, FR-CH-04):
 * the operator types what the caller said; same pipeline as a victim message (§3.6).
 * The audit entry records that it happened, never the text (rule 9).
 */
import { z } from "zod";
import { record } from "@/core/audit/record";
import { loadInteractionResource } from "@/core/cases/resource";
import { runPipeline } from "@/core/pipeline/run";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";

const Body = z.object({ text: z.string().trim().min(1).max(2000) });

export const POST = route({ auth: "staff", action: "case.transcript.read", body: Body }, async ({ user, req, params, body, authorize }) => {
  if (user.role !== "OPERATOR" && user.role !== "NHAA_SUPERVISOR") throw new ApiError("FORBIDDEN");
  const id = String(params.id);
  const { resource } = await loadInteractionResource(id);
  authorize("case.transcript.read", resource);
  const idempotencyKey = req.headers.get("idempotency-key")?.slice(0, 100) || undefined;
  const run = await runPipeline({ interactionId: id, trigger: "TEXT_MESSAGE", message: { text: body.text, idempotencyKey } });
  await record({ actorType: "USER", actorId: user.id, action: "operator.message", entityType: "interaction", entityId: id });
  return Response.json({ messageId: run.messageId }, { status: run.replayed ? 200 : 201 });
});
