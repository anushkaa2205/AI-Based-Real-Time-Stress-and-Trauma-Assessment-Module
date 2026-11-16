/**
 * One voice window from a calling system (API_CONTRACTS §6.3; tasks 7.5, 8.4, M.10).
 *
 * consent (voiceAnalysis) → size checks → analysis service (audio in memory only) → the same
 * pipeline as text, with the transcript as the message and the window's features as extra,
 * capped evidence. Raw audio is never written anywhere (FR-VOI-09). If voice analysis fails
 * the reply says `analysed: false` so the caller can switch to text (NFR-REL-02).
 *
 * Speaker separation (task M.10, FR-VOI-10): for MIXED audio (the default) the analysis service labels
 * the operator's and the caller's speech. Only the caller's words and voice are scored; the operator's
 * words are stored first as an OPERATOR turn, so the caller's answer is read with the question
 * (FR-NLP-11). The two voice fingerprints round-trip encrypted (`speakerStateEnc`). If a MIXED window
 * cannot be separated with confidence, the interaction is marked `voiceUnseparated` and every later
 * assessment is limited confidence.
 */
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { AudioFields, AudioResponse, type VictimLang } from "@/contracts/interaction";
import { addOperatorTurn } from "@/core/interactions/service";
import { decrypt, encrypt } from "@/core/privacy/crypto";
import { operatorTextNeedsScoring } from "@/core/safety-lexicon/speaker-check";
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
  const fields = AudioFields.safeParse({
    windowIndex: form.get("windowIndex"),
    startMs: form.get("startMs"),
    audioSource: form.get("audioSource") ?? undefined,
    firstSpeaker: form.get("firstSpeaker") ?? undefined,
  });
  if (!fields.success) throw new ApiError("VALIDATION_FAILED", "windowIndex and startMs are required; audioSource is CALLER_ONLY or MIXED");
  const { windowIndex, startMs, audioSource, firstSpeaker } = fields.data;

  const interaction = await Interaction.findById(interactionId).select("mode status consents.action uiLanguage voiceBaseline caseId +speakerStateEnc").lean();
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
    audioSource,
    firstSpeaker,
    speakerState: interaction.speakerStateEnc ? decrypt(interaction.speakerStateEnc) : null,
    audio,
    mimeType,
  });
  audio.fill(0); // drop the raw audio from memory as soon as it is analysed (FR-VOI-09)
  const analysedAt = Date.now();
  if (r.degraded) {
    console.warn(`[audio] voice analysis degraded (${r.reason})`);
    return reply(false, null, await currentShow());
  }

  // Speaker separation (M.10). An older service without `speakers` counts as "not separated".
  const sp = r.result.speakers;
  let operatorText = sp?.separated ? (sp.operatorText ?? "").trim() : "";
  let callerText = r.result.transcript?.text.trim() ?? ""; // the caller's words only, when separated
  // Safety net (rule 4): a life-safety statement labelled as the operator's is scored as the caller's.
  const mislabelSuspected = operatorTextNeedsScoring(operatorText);
  if (mislabelSuspected) {
    callerText = `${callerText} ${operatorText}`.trim();
    operatorText = "";
  }
  const separated = audioSource === "MIXED" && sp?.separated === true && sp.confident === true && !mislabelSuspected;
  // Only one voice heard so far (normal at the start of a call): everything was scored as the caller's,
  // and this window's assessment is limited confidence, without marking the whole call.
  const singleVoice = audioSource === "MIXED" && sp?.singleVoice === true && !mislabelSuspected;
  const update: Record<string, unknown> = {};
  if (sp?.state) update.speakerStateEnc = encrypt(sp.state);
  if (audioSource === "MIXED" && !separated && !singleVoice) update.voiceUnseparated = true; // FR-VOI-10: limited from now on
  if (Object.keys(update).length) await Interaction.updateOne({ _id: interaction._id }, { $set: update });
  // The operator's words go in first, as the question the caller's words answer (FR-NLP-11).
  if (operatorText) await addOperatorTurn(interactionId, operatorText.slice(0, 2000), { modality: "VOICE_TRANSCRIPT", idempotencyKey: `voice-op:${windowIndex}` });

  const text = callerText;
  const run = await runPipeline({
    interactionId,
    trigger: "VOICE_WINDOW",
    message: text ? { text: text.slice(0, 2000), idempotencyKey: `voice:${windowIndex}` } : undefined,
    voice: { windowIndex, startMs, analysis: r.result, audioSource },
    voiceLimited: singleVoice,
    deferAi: true,
  });
  // The transcript's AI analysis runs once the caller pauses (debounced re-score, see run.ts).
  if (text) after(() => new Promise((r) => setTimeout(r, VOICE_QUIET_MS + 500)).then(() => runDue()).catch(() => undefined));
  console.info(`[audio] window scored in ${Date.now() - started} ms (analysis ${analysedAt - started} ms, pipeline ${Date.now() - analysedAt} ms)`);
  return reply(true, text || null, run.showEmergencyPanel);
}
