/** Risk bands from SVI thresholds (task 2.5, FR-RISK-01). */
import { BAND_RANK, RISK_BANDS } from "@/models/enums";
import type { BandThresholds, RiskBand } from "./types";

export function assignBand(svi: number, t: BandThresholds): RiskBand {
  if (svi >= t.critical) return "CRITICAL";
  if (svi >= t.high) return "HIGH";
  if (svi >= t.moderate) return "MODERATE";
  return "LOW";
}

export function bandRank(band: RiskBand): number {
  return BAND_RANK[band];
}

/** The higher of the given bands (nulls ignored); LOW if none. */
export function maxBand(...bands: (RiskBand | null | undefined)[]): RiskBand {
  let best: RiskBand = "LOW";
  for (const b of bands) if (b && BAND_RANK[b] > BAND_RANK[best]) best = b;
  return best;
}

export { RISK_BANDS };
