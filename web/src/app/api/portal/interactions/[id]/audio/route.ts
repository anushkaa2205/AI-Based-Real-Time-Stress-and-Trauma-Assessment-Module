/**
 * POST /api/portal/interactions/{id}/audio (tasks N.4, M.12, P.4). One 5 s window from the visitor's
 * microphone, relayed to `POST /api/v1/integration/…/audio` with the portal key as the caller's own
 * channel (`CALLER_ONLY`) during the call (`LIVE_AUDIO`). The audio is only relayed, never stored.
 * Phase P: at most three minutes of speech per case (counted from the windows sent across all turns),
 * and the reply carries `heard`, the person's own words for that window (the module's transcript,
 * the caller's words only), so the page can show "We heard: …" and the Review step.
 * Public: only this browser's own cases; nothing about the assessment leaves (rule 1).
 */
import { MAX_LIVE_WINDOW_BYTES, type PortalAudioReceipt } from "@/contracts/portal";
import { openCase, passThrough } from "@/core/portal/assistant";
import { callModule } from "@/core/portal/client";
import { MAX_LIVE_CALL_MS, publicPortalRoute, speechLeft } from "@/core/portal/public";
import { originOf } from "@/core/portal/route";
import { ApiError } from "@/lib/problem";
import { VoiceWindow } from "@/models";

interface AudioReply {
  analysed?: boolean;
  transcript?: string | null;
  showEmergencyPanel?: boolean;
  emergency?: PortalAudioReceipt["emergency"];
  code?: string;
}

const SPEECH_OVER = "A case takes at most three minutes of speech; press Done, then Submit";

export const POST = publicPortalRoute({ limit: "audio", owned: true }, async ({ req, params }) => {
  const id = String(params.id);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_LIVE_WINDOW_BYTES + 4096) throw new ApiError("PAYLOAD_TOO_LARGE");
  await openCase(id, Date.now());
  const inForm = await req.formData().catch(() => null);
  const audio = inForm?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) throw new ApiError("VALIDATION_FAILED", "audio is required");
  const startMs = Number(inForm?.get("startMs") ?? "0");
  if (!(startMs < MAX_LIVE_CALL_MS)) throw new ApiError("INTERACTION_ENDED", SPEECH_OVER);
  if (!speechLeft(await VoiceWindow.countDocuments({ interactionId: id }))) throw new ApiError("INTERACTION_ENDED", SPEECH_OVER);
  const form = new FormData();
  form.set("audio", audio, audio instanceof File ? audio.name : "window.webm");
  form.set("windowIndex", String(inForm?.get("windowIndex") ?? ""));
  form.set("startMs", String(startMs));
  form.set("audioSource", "CALLER_ONLY");
  form.set("inputMethod", "LIVE_AUDIO");
  const r = await callModule<AudioReply>(originOf(req), `/interactions/${id}/audio`, { form });
  if (r.status !== 202 && r.status !== 200) passThrough(r.status, r.body?.code);
  const receipt: PortalAudioReceipt = {
    ok: true,
    analysed: r.body?.analysed === true,
    showEmergencyPanel: r.body?.showEmergencyPanel === true,
    emergency: r.body?.showEmergencyPanel ? (r.body.emergency ?? null) : null,
    heard: typeof r.body?.transcript === "string" ? r.body.transcript.trim() : "",
  };
  return receipt;
});
