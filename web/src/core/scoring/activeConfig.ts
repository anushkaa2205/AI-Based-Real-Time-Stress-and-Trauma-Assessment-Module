/**
 * The active scoring config from `scoring_configs` (FR-SVI-06), validated and
 * kept in memory for 60 s, so scoring a message costs no extra database trip.
 * A newly activated config is picked up within a minute. Falls back to the
 * built-in v1 if none is active, so scoring never stops (NFR-REL-01).
 */
import { ScoringConfig as ScoringConfigModel } from "@/models/scoring-config";
import { validateConfig } from "./config";
import { DEFAULT_CONFIG } from "./defaultConfig";
import type { ScoringConfig } from "./types";

const TTL_MS = 60_000;
const g = globalThis as unknown as { _scoringConfig?: { config: ScoringConfig; at: number } };

export function clearConfigCache(): void {
  g._scoringConfig = undefined;
}

export async function activeConfig(nowMs: number = Date.now()): Promise<ScoringConfig> {
  const hit = g._scoringConfig;
  if (hit && nowMs - hit.at < TTL_MS) return hit.config;

  const doc = await ScoringConfigModel.findOne({ isActive: true }).lean();
  let config = DEFAULT_CONFIG;
  if (doc) {
    const checked = validateConfig(JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
    if (checked.ok) config = checked.config;
    else console.error(`[scoring] active config v${doc.version} is invalid; using built-in v${DEFAULT_CONFIG.version}`);
  }
  g._scoringConfig = { config, at: nowMs };
  return config;
}
