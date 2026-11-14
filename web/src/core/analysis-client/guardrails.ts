/**
 * Guardrails on AI output (task 4.7, ARCHITECTURE §7, AC-NLP-05, CLAUDE.md rule 12).
 * Pure. The service saw REDACTED text; evidence must still be found word for
 * word in the ORIGINAL message, at a span we compute here, or it is dropped.
 * Unknown dimensions and flags are dropped; scores are clamped to 0–1.
 */
import { DIMENSIONS } from "@/models/enums";
import { OVERRIDE_FLAGS, type IndicatorInput, type OverrideFlag } from "@/core/scoring/types";
import { clamp01 } from "@/core/scoring/fuse";
import type { AnalyzeTextResponse } from "./schema";

export interface CheckedIndicator extends IndicatorInput {
  evidence: { start: number; end: number; quote: string };
  rationale: string;
}

export interface CheckedAnalysis {
  indicators: CheckedIndicator[];
  dropped: number;
  language: string;
  translationEn: string;
  emotion: { label: string; confidence: number };
  modelVersion: string;
}

const PLACEHOLDER = /\[(PHONE|EMAIL|ID|PIN|NAME|ADDRESS)\]/;

/** Exact span of `quote` in `original`, preferring the position the service reported. */
export function locate(original: string, quote: string, hint?: { start: number; end: number }): { start: number; end: number } | null {
  if (!quote.trim() || PLACEHOLDER.test(quote)) return null;
  if (hint && original.slice(hint.start, hint.end) === quote) return hint;
  const i = original.indexOf(quote);
  return i >= 0 ? { start: i, end: i + quote.length } : null;
}

export function checkAnalysis(res: AnalyzeTextResponse, original: string, redacted: string): CheckedAnalysis {
  const sameText = original === redacted;
  const indicators: CheckedIndicator[] = [];
  let dropped = 0;
  for (const [i, ind] of res.indicators.entries()) {
    const dim = ind.dimension as IndicatorInput["dimension"];
    const span = (DIMENSIONS as readonly string[]).includes(ind.dimension)
      ? locate(original, ind.evidence.quote, sameText ? ind.evidence : undefined)
      : null;
    if (!span) {
      dropped++;
      continue;
    }
    indicators.push({
      id: `ai:${i}`,
      dimension: dim,
      source: "TEXT_NLP",
      score: clamp01(ind.score),
      confidence: clamp01(ind.confidence),
      negated: ind.negated,
      flags: ind.flags.filter((f): f is OverrideFlag => (OVERRIDE_FLAGS as readonly string[]).includes(f)),
      label: ind.rationale ? ind.rationale.slice(0, 120) : undefined,
      rationale: ind.rationale.slice(0, 120),
      evidence: { ...span, quote: ind.evidence.quote },
    });
  }
  return {
    indicators,
    dropped,
    language: res.language.code,
    translationEn: res.translation.en,
    emotion: { label: res.emotion.label, confidence: clamp01(res.emotion.confidence) },
    modelVersion: res.modelVersion.nlp,
  };
}
