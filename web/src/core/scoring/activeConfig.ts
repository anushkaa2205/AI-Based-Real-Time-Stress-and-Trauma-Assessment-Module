/**
 * The active scoring config from `scoring_configs` (FR-SVI-06), validated and
 * cached per version. Falls back to the built-in v1 if none is active, so
 * scoring never stops (NFR-REL-01).
 */
import type { ClientSession } from "mongoose";
import { ScoringConfig as ScoringConfigModel } from "@/models/scoring-config";
import { validateConfig } from "./config";
import { DEFAULT_CONFIG } from "./defaultConfig";
import type { ScoringConfig } from "./types";

const cache = new Map<number, ScoringConfig>();

export async function activeConfig(session?: ClientSession): Promise<ScoringConfig> {
  const doc = await ScoringConfigModel.findOne({ isActive: true }).session(session ?? null).lean();
  if (!doc) return DEFAULT_CONFIG;
  const cached = cache.get(doc.version);
  if (cached) return cached;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const checked = validateConfig(plain);
  if (!checked.ok) {
    console.error(`[scoring] active config v${doc.version} is invalid; using built-in v${DEFAULT_CONFIG.version}`);
    return DEFAULT_CONFIG;
  }
  cache.set(doc.version, checked.config);
  return checked.config;
}
