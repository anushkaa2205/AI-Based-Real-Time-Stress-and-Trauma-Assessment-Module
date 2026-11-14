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
