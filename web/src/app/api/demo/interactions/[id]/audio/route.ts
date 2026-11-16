/**
 * POST /api/demo/interactions/{id}/audio (task N.4, M.12). One 5 s window from the visitor's
 * microphone, relayed to `POST /api/v1/integration/…/audio` with the demo key as the caller's own
 * channel (`CALLER_ONLY`) during the call (`LIVE_AUDIO`). The audio is only relayed, never stored.
 * Public: only this browser's own cases; the reply is a receipt plus the emergency panel (rule 1).
 */
import { MAX_LIVE_WINDOW_BYTES, type DemoReceipt } from "@/contracts/demo";
import { callModule } from "@/core/demo/client";
import { MAX_LIVE_CALL_MS, publicDemoRoute } from "@/core/demo/public";
import { originOf } from "@/core/demo/route";
import { ApiError } from "@/lib/problem";
import { passThrough } from "../messages/route";

interface AudioReply {
  analysed?: boolean;
  showEmergencyPanel?: boolean;
  emergency?: DemoReceipt["emergency"];
  code?: string;
}

export const POST = publicDemoRoute({ limit: "audio", owned: true }, async ({ req, params }) => {
  const id = String(params.id);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_LIVE_WINDOW_BYTES + 4096) throw new ApiError("PAYLOAD_TOO_LARGE");
  const inForm = await req.formData().catch(() => null);
  const audio = inForm?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) throw new ApiError("VALIDATION_FAILED", "audio is required");
  const startMs = Number(inForm?.get("startMs") ?? "0");
  if (!(startMs < MAX_LIVE_CALL_MS)) throw new ApiError("INTERACTION_ENDED", "A demo call lasts at most three minutes");
  const form = new FormData();
  form.set("audio", audio, audio instanceof File ? audio.name : "window.webm");
  form.set("windowIndex", String(inForm?.get("windowIndex") ?? ""));
  form.set("startMs", String(startMs));
  form.set("audioSource", "CALLER_ONLY");
  form.set("inputMethod", "LIVE_AUDIO");
  const r = await callModule<AudioReply>(originOf(req), `/interactions/${id}/audio`, { form });
  if (r.status !== 202 && r.status !== 200) passThrough(r.status, r.body?.code);
  const receipt: DemoReceipt & { analysed: boolean } = {
    ok: true,
    analysed: r.body?.analysed === true,
    showEmergencyPanel: r.body?.showEmergencyPanel === true,
    emergency: r.body?.showEmergencyPanel ? (r.body.emergency ?? null) : null,
  };
  return receipt;
});
