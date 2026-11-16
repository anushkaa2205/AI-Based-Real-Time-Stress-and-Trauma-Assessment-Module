/**
 * POST /api/demo/interactions/{id}/audio (API_CONTRACTS §6.5, task M.12). One 5 s window from the
 * presenter's microphone, relayed to `POST /api/v1/integration/…/audio` with the demo key as the
 * caller's own channel (`CALLER_ONLY`) during the call (`LIVE_AUDIO`). The module's status and body
 * come back unchanged, so the recorder handles them exactly as an NHAA app would; the request id and
 * time ride along in headers. The audio is only relayed, never stored.
 */
import { MAX_LIVE_WINDOW_BYTES } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { demoRoute, originOf } from "@/core/demo/route";
import { ApiError } from "@/lib/problem";

export const POST = demoRoute({}, async ({ req, params }) => {
  const id = String(params.id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  if (Number(req.headers.get("content-length") ?? "0") > MAX_LIVE_WINDOW_BYTES + 4096) throw new ApiError("PAYLOAD_TOO_LARGE");
  const inForm = await req.formData().catch(() => null);
  const audio = inForm?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) throw new ApiError("VALIDATION_FAILED", "audio is required");
  const form = new FormData();
  form.set("audio", audio, audio instanceof File ? audio.name : "window.webm");
  form.set("windowIndex", String(inForm?.get("windowIndex") ?? ""));
  form.set("startMs", String(inForm?.get("startMs") ?? ""));
  form.set("audioSource", "CALLER_ONLY");
  form.set("inputMethod", "LIVE_AUDIO");
  const r = await callModule(originOf(req), `/interactions/${id}/audio`, { form });
  return Response.json(r.body, { status: r.status, headers: { "x-module-request-id": r.call.requestId ?? "", "x-module-ms": String(r.call.ms) } });
});
