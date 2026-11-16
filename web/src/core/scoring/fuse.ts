/**
 * Dimension fusion (task 2.4, FR-IND-03, FR-VOI-08, REQUIREMENTS Appendix A step 1).
 *
 *  1. Within a source, a dimension takes the MAXIMUM indicator score
 *     (one strong signal is not diluted by many weak ones).
 *  2. Across sources: confidence-weighted average Σ w·c·x / Σ w·c.
 *  3. Voice alone is capped at `voiceOnlyCap` (0.6).
 *  4. Reviewed indicators win: ADJUSTED uses the responder's score, CONFIRMED
 *     keeps the score, both at confidence 1; REJECTED and negated are excluded.
 */
import { DIMENSIONS, SIGNAL_SOURCES } from "@/models/enums";
import type { Dimension, IndicatorInput, ScoringConfig, SignalSource } from "./types";

export interface FusedDimension {
  score: number;
  confidence: number;
  bySource: Partial<Record<SignalSource, number>>;
}

export const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Score and confidence actually used for scoring, or null if the indicator is excluded. */
export function effective(ind: IndicatorInput): { score: number; confidence: number } | null {
  if (ind.negated || ind.status === "REJECTED") return null;
  if (ind.status === "ADJUSTED") {
    if (ind.reviewScore === null || ind.reviewScore === undefined) return null;
    return { score: clamp01(ind.reviewScore), confidence: 1 };
  }
  if (ind.status === "CONFIRMED") return { score: clamp01(ind.score), confidence: 1 };
  return { score: clamp01(ind.score), confidence: clamp01(ind.confidence) };
}

/**
 * Sources weighing this much together count as full coverage (e.g. text NLP 0.4 + safety lexicon 0.4).
 * Unchanged in config v3 when the screener source (0.3) was removed (REQUIREMENTS Appendix A).
 */
const FULL_COVERAGE_WEIGHT = 0.7;

export function fuseDimensions(
  indicators: readonly IndicatorInput[],
  config: ScoringConfig,
): Record<Dimension, FusedDimension> {
  // best[dimension][source] = strongest indicator (ties: higher confidence)
  const best = new Map<Dimension, Map<SignalSource, { score: number; confidence: number }>>();
  for (const ind of indicators) {
    const e = effective(ind);
    if (!e) continue;
    const perSource = best.get(ind.dimension) ?? new Map();
    const prev = perSource.get(ind.source);
    if (!prev || e.score > prev.score || (e.score === prev.score && e.confidence > prev.confidence)) {
      perSource.set(ind.source, e);
    }
    best.set(ind.dimension, perSource);
  }

  const out = {} as Record<Dimension, FusedDimension>;
  for (const dimension of DIMENSIONS) {
    const perSource = best.get(dimension);
    if (!perSource || perSource.size === 0) {
      out[dimension] = { score: 0, confidence: 0, bySource: {} };
      continue;
    }
    const voiceOnly = perSource.size === 1 && perSource.has("VOICE");
    let num = 0;
    let den = 0;
    let weightPresent = 0;
    const bySource: Partial<Record<SignalSource, number>> = {};
    // Fixed source order keeps floating-point sums identical run to run (FR-SVI-07).
    for (const source of SIGNAL_SOURCES) {
      const e = perSource.get(source);
      if (!e) continue;
      const x = voiceOnly ? Math.min(e.score, config.voiceOnlyCap) : e.score;
      const w = config.sourceWeights[source];
      bySource[source] = x;
      num += w * e.confidence * x;
      den += w * e.confidence;
      weightPresent += w;
    }
    const score = den > 0 ? num / den : 0;
    // Average confidence of the sources present, reduced when few/weak sources are present.
    const meanConfidence = weightPresent > 0 ? den / weightPresent : 0;
    const coverage = Math.min(1, weightPresent / FULL_COVERAGE_WEIGHT);
    out[dimension] = {
      score: clamp01(voiceOnly ? Math.min(score, config.voiceOnlyCap) : score),
      confidence: clamp01(meanConfidence * coverage),
      bySource,
    };
  }
  return out;
}
