/**
 * POST /api/v1/victim/interactions/{id}/audio: one voice chunk (API_CONTRACTS §3.7, task 7.5).
 *
 * consent (voiceAnalysis) → size checks → analysis service (audio in memory only) →
 * the same pipeline as text, with the transcript as the message and the voice window's
 * features as extra, capped evidence. The raw audio is never written anywhere (FR-VOI-09).
 * If voice analysis fails the response says `analysed: false` and the page offers typing (NFR-REL-02).
 */
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { AudioFields, AudioResponse } from "@/contracts/victim";
import { analyzeAudio } from "@/core/analysis-client/client";
import { allowsVoiceAnalysis } from "@/core/consent/mode";
import { runDue } from "@/core/jobs/runDue";
import { runPipeline } from "@/core/pipeline/run";
import { emergencyPanel, shouldShowEmergency } from "@/core/victim/emergency";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Case, Interaction, VoiceWindow } from "@/models";

const MAX_AUDIO_BYTES = 200 * 1024;
const ALLOWED_TYPES = ["audio/webm", "audio/ogg", "audio/wav", "audio/x-wav"];

export const POST = route({ auth: "victim" }, async ({ req, victim }) => {
  const started = Date.now();
  if (Number(req.headers.get("content-length") ?? "0") > MAX_AUDIO_BYTES + 4096) throw new ApiError("PAYLOAD_TOO_LARGE");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "multipart/form-data expected");
  }
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError("VALIDATION_FAILED", "audio is required");
  if (file.size > MAX_AUDIO_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
  const mimeType = (file.type || "audio/webm").toLowerCase();
  if (!ALLOWED_TYPES.some((t) => mimeType.startsWith(t))) throw new ApiError("BAD_AUDIO", "Unsupported audio format");
  const fields = AudioFields.safeParse({ windowIndex: form.get("windowIndex"), startMs: form.get("startMs") });
  if (!fields.success) throw new ApiError("VALIDATION_FAILED", "windowIndex and startMs are required");
  const { windowIndex, startMs } = fields.data;

  const interaction = await Interaction.findById(victim.interactionId).select("mode status consents.action uiLanguage voiceBaseline caseId").lean();
  if (!interaction) throw new ApiError("NOT_FOUND");
  if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  if (!interaction.consents?.length || !allowsVoiceAnalysis(interaction.mode)) throw new ApiError("CONSENT_REQUIRED", "Voice needs your consent.");

  // A retried chunk is answered from what we already have, without analysing it again.
  const done = await VoiceWindow.exists({ interactionId: interaction._id, windowIndex });
  if (done) {
    const c = await Case.findById(interaction.caseId).select("currentBand").lean();
    const show = shouldShowEmergency(c?.currentBand);
    return Response.json(
      AudioResponse.parse({ windowIndex, transcript: null, analysed: true, showEmergencyPanel: show, emergency: show ? emergencyPanel(victim.lang) : null }),
      { status: 202, headers: { "Idempotent-Replay": "true" } },
    );
  }

  const audio = new Uint8Array(await file.arrayBuffer());
  const r = await analyzeAudio({
    requestId: randomUUID(),
    windowIndex,
    startMs,
    languageHint: interaction.uiLanguage,
    baseline: (interaction.voiceBaseline as Record<string, number> | null) ?? null,
    audio,
    mimeType,
  });
  audio.fill(0); // drop the raw audio from memory as soon as it is analysed (FR-VOI-09)
  if (r.degraded) {
    console.warn(`[audio] voice analysis degraded (${r.reason})`);
    const c = await Case.findById(interaction.caseId).select("currentBand").lean();
    const show = shouldShowEmergency(c?.currentBand);
    return Response.json(
      AudioResponse.parse({ windowIndex, transcript: null, analysed: false, showEmergencyPanel: show, emergency: show ? emergencyPanel(victim.lang) : null }),
      { status: 202 },
    );
  }

  const text = r.result.transcript?.text.trim() ?? "";
  const run = await runPipeline({
    interactionId: victim.interactionId,
    trigger: "VOICE_WINDOW",
    message: text ? { text: text.slice(0, 2000), idempotencyKey: `voice:${windowIndex}` } : undefined,
    voice: { windowIndex, startMs, analysis: r.result },
    deferAi: true,
  });
  // The transcript's text analysis runs right after the response (the deferred rescore job).
  if (text) after(() => runDue().catch(() => undefined));
  console.info(`[audio] window scored in ${Date.now() - started} ms`);
  return Response.json(
    AudioResponse.parse({
      windowIndex,
      transcript: text || null,
      analysed: true,
      showEmergencyPanel: run.showEmergencyPanel,
      emergency: run.showEmergencyPanel ? emergencyPanel(victim.lang) : null,
    }),
    { status: 202 },
  );
});
