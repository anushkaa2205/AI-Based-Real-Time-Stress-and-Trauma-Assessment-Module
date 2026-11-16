/** Zod contract for the analysis service response (API_CONTRACTS §8.1, task 4.7). */
import { z } from "zod";

const Evidence = z.object({ quote: z.string(), start: z.number().int().min(0), end: z.number().int().min(0) });

export const AnalyzeTextResponse = z.object({
  language: z.object({ code: z.string(), confidence: z.number(), script: z.string() }),
  translation: z.object({ en: z.string() }),
  indicators: z.array(
    z.object({
      dimension: z.string(),
      score: z.number(),
      confidence: z.number(),
      negated: z.boolean(),
      flags: z.array(z.string()).default([]),
      evidence: Evidence,
      rationale: z.string().default(""),
    }),
  ),
  immediateDanger: z.object({ detected: z.boolean(), confidence: z.number(), evidence: Evidence.nullable() }),
  emotion: z.object({ label: z.string(), confidence: z.number(), distribution: z.record(z.string(), z.number()) }),
  modelVersion: z.object({ nlp: z.string() }).loose(),
  latencyMs: z.number().optional(),
  cached: z.boolean().optional(),
});
export type AnalyzeTextResponse = z.infer<typeof AnalyzeTextResponse>;

export const SummarizeResponse = z.object({ summary: z.string(), summaryEn: z.string(), modelVersion: z.string() });
export type SummarizeResponse = z.infer<typeof SummarizeResponse>;

/** POST /v1/analyze/audio (API_CONTRACTS §8.2, task 7.5). */
const Num = z.number().finite();
export const AnalyzeAudioResponse = z.object({
  durationMs: Num,
  voicedMs: Num,
  transcript: z
    .object({
      text: z.string(),
      language: z.string().nullable(),
      confidence: Num.nullable(),
      words: z.array(z.object({ w: z.string(), startMs: Num, endMs: Num })),
    })
    .nullable(),
  pauses: z.object({ count: Num, meanMs: Num, maxMs: Num, silenceRatio: Num }),
  pitch: z.object({ meanHz: Num, stdHz: Num, rangeHz: Num }).nullable(),
  speechRateWpm: Num.nullable(),
  energy: z.object({ meanDb: Num, deltaDb: Num }).nullable(),
  voiceQuality: z.object({ jitter: Num, shimmer: Num }).nullable(),
  events: z.array(z.object({ type: z.string(), startMs: Num, endMs: Num, confidence: Num })),
  emotion: z.object({ label: z.string(), confidence: Num, distribution: z.record(z.string(), Num) }),
  baselineDeviation: z.record(z.string(), Num.nullable()).nullable(),
  baselineUpdate: z.record(z.string(), Num).nullable(),
  modelVersion: z.object({ stt: z.string().nullable(), vad: z.string(), ser: z.string(), events: z.string() }).loose(),
  latencyMs: Num,
  /**
   * Task M.10 (FR-VOI-10). For MIXED audio: whether the two voices were separated with confidence. The
   * `transcript` and all features above are then the caller's only; `operatorText` is the operator's words.
   * `state` is opaque (voice fingerprints) and must be stored encrypted. Absent from older services.
   */
  speakers: z
    .object({
      audioSource: z.enum(["CALLER_ONLY", "MIXED"]),
      separated: z.boolean(),
      confident: z.boolean(),
      callerMs: Num,
      operatorMs: Num,
      operatorText: z.string().nullable(),
      /** Only one voice heard so far in a MIXED call: all speech was treated as the caller's */
      singleVoice: z.boolean().optional(),
      state: z.string().nullable(),
    })
    .optional(),
});
export type AnalyzeAudioResponse = z.infer<typeof AnalyzeAudioResponse>;

/** POST /v1/demo/generate (task M.13, demo layer only): a synthetic chatbot conversation. */
export const GenerateResponse = z.object({
  turns: z.array(z.object({ speaker: z.enum(["CHATBOT", "PERSON"]), text: z.string().min(1).max(400) })).min(1).max(12),
  synthetic: z.literal(true),
  modelVersion: z.string(),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;
