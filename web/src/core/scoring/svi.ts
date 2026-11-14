/**
 * Stress Vulnerability Index (task 2.5, FR-SVI-01/03/04, REQUIREMENTS Appendix A step 2).
 * SVI = round(100 · Σ_d W_d · score_d), an integer 0–100.
 * Contributions (one decimal) add up to the SVI within ±1 (AC-SVI-03).
 */
import { DIMENSIONS } from "@/models/enums";
import type { FusedDimension } from "./fuse";
import type { Dimension, ScoringConfig } from "./types";

export interface SviResult {
  svi: number;
  contributions: Record<Dimension, number>;
  /** Overall confidence 0–1: lower with little data or a single source (FR-SVI-04) */
  confidence: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeSvi(dims: Record<Dimension, FusedDimension>, config: ScoringConfig): SviResult {
  let raw = 0;
  const contributions = {} as Record<Dimension, number>;
  let confNum = 0;
  let confDen = 0;
  const sources = new Set<string>();

  for (const d of DIMENSIONS) {
    const w = config.dimensionWeights[d];
    const part = 100 * w * dims[d].score;
    raw += part;
    contributions[d] = round1(part);
    const present = Object.keys(dims[d].bySource);
    if (present.length) {
      present.forEach((s) => sources.add(s));
      confNum += w * dims[d].confidence;
      confDen += w;
    }
  }

  const svi = Math.min(100, Math.max(0, Math.round(raw)));
  // One kind of source (e.g. a single text message) halves the overall confidence.
  const sourceFactor = Math.min(1, sources.size / 2);
  const confidence = confDen > 0 ? Math.round((confNum / confDen) * sourceFactor * 100) / 100 : 0;
  return { svi, contributions, confidence };
}
