/**
 * One voice chunk (API_CONTRACTS §3.7; tasks 7.5 and 8.4). Shared by the victim API and the
 * integration API.
 *
 * consent (voiceAnalysis) → size checks → analysis service (audio in memory only) → the same
 * pipeline as text, with the transcript as the message and the window's features as extra,
 * capped evidence. Raw audio is never written anywhere (FR-VOI-09). If voice analysis fails
 * the reply says `analysed: false` so the caller can switch to text (NFR-REL-02).
 */
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { AudioFields, AudioResponse, type VictimLang } from "@/contracts/interaction";
import { analyzeAudio } from "@/core/analysis-client/client";
import { allowsVoiceAnalysis } from "@/core/consent/mode";
import { runDue } from "@/core/jobs/runDue";
import { VOICE_QUIET_MS, runPipeline } from "@/core/pipeline/run";
import { emergencyPanel, shouldShowEmergency } from "@/core/interactions/emergency";
import { ApiError } from "@/lib/problem";
import { Case, Interaction, VoiceWindow } from "@/models";

export const MAX_AUDIO_BYTES = 200 * 1024;
const ALLOWED_TYPES = ["audio/webm", "audio/ogg", "audio/wav", "audio/x-wav"];

export async function handleAudioChunk(req: Request, interactionId: string, lang: VictimLang): Promise<Response> {
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

  const interaction = await Interaction.findById(interactionId).select("mode status consents.action uiLanguage voiceBaseline caseId").lean();
  if (!interaction) throw new ApiError("NOT_FOUND");
  if (interaction.status !== "ACTIVE") throw new ApiError("INTERACTION_ENDED");
  if (!interaction.consents?.length || !allowsVoiceAnalysis(interaction.mode)) throw new ApiError("CONSENT_REQUIRED", "Voice needs your consent.");

  const reply = async (analysed: boolean, transcript: string | null, show: boolean, extra: Record<string, string> = {}) =>
    Response.json(
      AudioResponse.parse({ windowIndex, transcript, analysed, showEmergencyPanel: show, emergency: show ? emergencyPanel(lang) : null }),
      { status: 202, headers: extra },
    );
  const currentShow = async () => shouldShowEmergency((await Case.findById(interaction.caseId).select("currentBand").lean())?.currentBand);

  // A retried chunk is answered from what we already have, without analysing it again.
  if (await VoiceWindow.exists({ interactionId: interaction._id, windowIndex })) return reply(true, null, await currentShow(), { "Idempotent-Replay": "true" });

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
  const analysedAt = Date.now();
  if (r.degraded) {
    console.warn(`[audio] voice analysis degraded (${r.reason})`);
    return reply(false, null, await currentShow());
  }

  const text = r.result.transcript?.text.trim() ?? "";
  const run = await runPipeline({
    interactionId,
    trigger: "VOICE_WINDOW",
    message: text ? { text: text.slice(0, 2000), idempotencyKey: `voice:${windowIndex}` } : undefined,
    voice: { windowIndex, startMs, analysis: r.result },
    deferAi: true,
  });
  // The transcript's AI analysis runs once the caller pauses (debounced re-score, see run.ts).
  if (text) after(() => new Promise((r) => setTimeout(r, VOICE_QUIET_MS + 500)).then(() => runDue()).catch(() => undefined));
  console.info(`[audio] window scored in ${Date.now() - started} ms (analysis ${analysedAt - started} ms, pipeline ${Date.now() - analysedAt} ms)`);
  return reply(true, text || null, run.showEmergencyPanel);
}
