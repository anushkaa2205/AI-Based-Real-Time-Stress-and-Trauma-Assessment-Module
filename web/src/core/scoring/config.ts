/**
 * Validation for scoring configs (task 2.1, FR-SVI-06). Rejects weights that
 * do not sum to 1, thresholds out of order, and unknown references, so a bad
 * config can never be activated (`422 INVALID_CONFIG`).
 */
import { z } from "zod";
import { DIMENSIONS, RISK_BANDS, ROLES, SIGNAL_SOURCES, SUPPORT_TYPES, URGENCIES } from "@/models/enums";
import { CASE_FACTS, OVERRIDE_FLAGS, type ScoringConfig } from "./types";

const EPS = 1e-6;
const unit = z.number().min(0).max(1);
const band = z.enum(RISK_BANDS);

const RecCondition = z.union([
  z.object({ band }).strict(),
  z.object({ dimension: z.enum(DIMENSIONS), gte: unit }).strict(),
  z.object({ override: z.string().regex(/^OV-\d+$/) }).strict(),
  z.object({ fact: z.enum(CASE_FACTS) }).strict(),
]);

export const ScoringConfigSchema = z
  .object({
    version: z.number().int().positive(),
    dimensionWeights: z.record(z.enum(DIMENSIONS), unit),
    sourceWeights: z.record(z.enum(SIGNAL_SOURCES), unit),
    voiceOnlyCap: unit,
    bandThresholds: z.object({
      moderate: z.number().int().min(1).max(100),
      high: z.number().int().min(1).max(100),
      critical: z.number().int().min(1).max(100),
    }),
    safetyOverrides: z
      .array(
        z.object({
          id: z.string().regex(/^OV-\d+$/),
          whenAny: z.array(z.enum(OVERRIDE_FLAGS)).min(1),
          minBand: band,
          label: z.object({ en: z.string().min(1), hi: z.string().min(1) }),
        }),
      )
      .min(1),
    recommendationRules: z
      .array(
        z.object({
          id: z.string().min(1),
          type: z.enum(SUPPORT_TYPES),
          anyOf: z.array(RecCondition).min(1),
          responsibleRole: z.enum(ROLES),
          urgencyByBand: z.partialRecord(band, z.enum(URGENCIES)),
          requiresApproval: z.boolean(),
          reason: z.string().min(1),
          legalBasis: z.string().optional(),
        }),
      )
      .min(1),
    alertPolicy: z.object({
      criticalAckTimeoutSec: z.number().int().positive(),
      escalationChain: z.array(z.enum(ROLES)).min(1),
    }),
  })
  .superRefine((c, ctx) => {
    const sum = Object.values(c.dimensionWeights).reduce((a, b) => a + b, 0);
    if (Object.keys(c.dimensionWeights).length !== DIMENSIONS.length) {
      ctx.addIssue({ code: "custom", path: ["dimensionWeights"], message: "must give a weight for all 8 dimensions" });
    } else if (Math.abs(sum - 1) > EPS) {
      ctx.addIssue({ code: "custom", path: ["dimensionWeights"], message: `must sum to 1 (got ${sum.toFixed(4)})` });
    }
    if (Object.keys(c.sourceWeights).length !== SIGNAL_SOURCES.length) {
      ctx.addIssue({ code: "custom", path: ["sourceWeights"], message: "must give a weight for every source" });
    }
    const t = c.bandThresholds;
    if (!(t.moderate < t.high && t.high < t.critical)) {
      ctx.addIssue({ code: "custom", path: ["bandThresholds"], message: "must increase: moderate < high < critical" });
    }
    const ids = c.safetyOverrides.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["safetyOverrides"], message: "override ids must be unique" });
    }
    c.recommendationRules.forEach((r, i) => {
      if (Object.keys(r.urgencyByBand).length === 0) {
        ctx.addIssue({ code: "custom", path: ["recommendationRules", i, "urgencyByBand"], message: "needs at least one band" });
      }
      for (const cond of r.anyOf) {
        if ("override" in cond && !ids.includes(cond.override)) {
          ctx.addIssue({ code: "custom", path: ["recommendationRules", i], message: `unknown override ${cond.override}` });
        }
      }
    });
  });

export type ConfigValidation = { ok: true; config: ScoringConfig } | { ok: false; errors: string[] };

export function validateConfig(input: unknown): ConfigValidation {
  const r = ScoringConfigSchema.safeParse(input);
  if (r.success) return { ok: true, config: r.data as ScoringConfig };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "(config)"}: ${i.message}`) };
}
