/**
 * Safety overrides (task 2.6, FR-RISK-02/03, REQUIREMENTS Appendix B).
 * Overrides only RAISE the band. Once one fires the band is locked: later calm
 * messages cannot lower it; only a human band override can (cases.bandOverrides).
 */
import { BAND_RANK } from "@/models/enums";
import { maxBand } from "./bands";
import { effective } from "./fuse";
import type { IndicatorInput, OverrideFlag, OverrideRule, RiskBand } from "./types";

export interface OverrideResult {
  band: RiskBand;
  /** Ids of the rules that fired, strongest first (e.g. ["OV-2", "OV-7"]) */
  fired: string[];
  lockedBand: RiskBand | null;
}

/**
 * Flags from indicators that count for scoring. Voice indicators never carry
 * override power (FR-VOI-08, AC-VOI-05): acoustic cues are supporting evidence.
 */
export function flagsFrom(indicators: readonly IndicatorInput[]): Set<OverrideFlag> {
  const flags = new Set<OverrideFlag>();
  for (const ind of indicators) {
    if (ind.source === "VOICE" || !effective(ind)) continue;
    for (const f of ind.flags ?? []) flags.add(f);
  }
  return flags;
}

export function applyOverrides(
  computedBand: RiskBand,
  flags: ReadonlySet<OverrideFlag>,
  rules: readonly OverrideRule[],
  locked: RiskBand | null,
): OverrideResult {
  const firedRules = rules
    .filter((r) => r.whenAny.some((f) => flags.has(f)))
    .sort((a, b) => BAND_RANK[b.minBand] - BAND_RANK[a.minBand] || a.id.localeCompare(b.id, "en"));
  const band = maxBand(computedBand, locked, ...firedRules.map((r) => r.minBand));
  const lockedBand = firedRules.length ? maxBand(locked, band) : locked;
  return { band, fired: firedRules.map((r) => r.id), lockedBand };
}
