/**
 * Evaluation scenario format (task E.1, AC-EVAL-01).
 * One JSON file per scenario in evaluation/scenarios/. Synthetic, respectful,
 * non-graphic (C-DAT-01, C-DAT-03). Labels need two team members to agree.
 */
import { z } from "zod";

const Band = z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]);
const Dimension = z.enum([
  "ACUTE_STRESS",
  "SEVERE_TRAUMA",
  "FEAR_ANXIETY",
  "DEPRESSION",
  "SUICIDAL_IDEATION",
  "INTIMIDATION",
  "SOCIAL_ISOLATION",
  "EXTREME_VULNERABILITY",
]);
const Support = z.enum([
  "COUNSELLING",
  "LEGAL_AID",
  "MEDICAL_ASSISTANCE",
  "POLICE_INTERVENTION",
  "WITNESS_PROTECTION",
  "EMERGENCY_SUPPORT",
  "REHABILITATION_RELIEF",
  "INFORMATION",
]);

export const ScenarioSchema = z
  .object({
    id: z.string().regex(/^S\d{3}$/),
    language: z.enum(["en", "hi", "hi-Latn", "mr", "ta", "bn"]),
    channel: z.enum(["CHATBOT", "PORTAL", "VOICE_CALL", "IVRS"]),
    /** For the fairness report only (NFR-ETH-04); never a risk feature */
    gender: z.enum(["F", "M", "OTHER", "UNDISCLOSED"]),
    summary: z.string().min(5),
    context: z.record(z.string(), z.union([z.boolean(), z.string()])).default({}),
    screeners: z.array(z.object({ itemCode: z.string(), value: z.number().int().min(0).max(3) })).default([]),
    messages: z.array(z.string().min(1)).default([]),
    expected: z.object({
      band: Band,
      indicators: z.array(Dimension),
      recommendations: z.array(Support),
    }),
    tags: z.array(z.enum(["negation", "dialect", "voice", "indirect", "context-only", "screener-only"])).default([]),
    /** Names or initials of the team members who agreed on the labels (need 2) */
    reviewedBy: z.array(z.string()).default([]),
  })
  .strict();

export type Scenario = z.infer<typeof ScenarioSchema>;
