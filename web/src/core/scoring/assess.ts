/**
 * The whole deterministic assessment in one pure call (tasks 2.4–2.7):
 * indicators → fuse → SVI → band → overrides → explanation.
 * Same input + same config version ⇒ identical output (FR-SVI-07, AC-SVI-04).
 */
import { DIMENSIONS } from "@/models/enums";
import { assignBand, maxBand } from "./bands";
import { explain } from "./explain";
import { effective, fuseDimensions } from "./fuse";
import { applyOverrides, flagsFrom } from "./overrides";
import { computeSvi } from "./svi";
import type { AssessmentDraft, Dimension, DimensionResult, IndicatorInput, OverrideFlag, RiskBand, ScoringConfig } from "./types";

export interface AssessInput {
  indicators: readonly IndicatorInput[];
  config: ScoringConfig;
  /** cases.overrideLockedBand from earlier assessments */
  lockedBand?: RiskBand | null;
  /** true when the AI service was unavailable (NFR-REL-01) */
  limitedConfidence?: boolean;
  /**
   * Override flags to use instead of those on the indicators. Set after a human
   * band override, so only evidence newer than that decision can raise the band
   * again (FR-RISK-03). Indicator scores are unaffected.
   */
  flags?: ReadonlySet<OverrideFlag>;
}

const TOP_EVIDENCE = 3;

export function assess(input: AssessInput): AssessmentDraft {
  const { indicators, config } = input;
  const fused = fuseDimensions(indicators, config);
  const { svi, contributions, confidence } = computeSvi(fused, config);
  // NFR-ETH-05: "No" answers (denials) may lower the SVI, never the band. The band is at
  // least what the evidence gives without them.
  const denials = indicators.some((i) => i.denial);
  const computedBand = denials
    ? maxBand(
        assignBand(svi, config.bandThresholds),
        assignBand(computeSvi(fuseDimensions(indicators.filter((i) => !i.denial), config), config).svi, config.bandThresholds),
      )
    : assignBand(svi, config.bandThresholds);
  const { band, fired, lockedBand } = applyOverrides(
    computedBand,
    input.flags ?? flagsFrom(indicators),
    config.safetyOverrides,
    input.lockedBand ?? null,
  );

  const dimensions = {} as Record<Dimension, DimensionResult>;
  for (const d of DIMENSIONS) {
    dimensions[d] = { score: fused[d].score, confidence: fused[d].confidence, bySource: fused[d].bySource, contribution: contributions[d] };
  }

  const topDimensions = [...DIMENSIONS]
    .filter((d) => contributions[d] > 0)
    .sort((a, b) => contributions[b] - contributions[a] || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b));

  // Evidence items ranked by weight × score × confidence; ties broken by id/label for determinism.
  const topEvidence = indicators
    .map((ind) => ({ ind, e: effective(ind) }))
    .filter((x): x is { ind: IndicatorInput; e: { score: number; confidence: number } } => !!x.e && x.e.score > 0)
    .map(({ ind, e }) => ({ ind, rank: config.dimensionWeights[ind.dimension] * e.score * e.confidence }))
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        (a.ind.id ?? "").localeCompare(b.ind.id ?? "", "en") ||
        (a.ind.label ?? "").localeCompare(b.ind.label ?? "", "en"),
    )
    .slice(0, TOP_EVIDENCE)
    .map(({ ind }) => ({ indicatorId: ind.id ?? null, dimension: ind.dimension, label: ind.label ?? ind.dimension }));

  const limitedConfidence = input.limitedConfidence ?? false;
  const explainInput = {
    band,
    svi,
    overridesFired: fired,
    overrideRules: config.safetyOverrides,
    topDimensions,
    limitedConfidence,
  };

  return {
    svi,
    computedBand,
    band,
    overridesFired: fired,
    lockedBand,
    dimensions,
    confidence,
    limitedConfidence,
    topEvidence,
    explanation: { en: explain(explainInput, "en"), hi: explain(explainInput, "hi") },
    configVersion: config.version,
  };
}
