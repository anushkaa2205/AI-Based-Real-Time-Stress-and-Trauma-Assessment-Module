/**
 * Evaluation scenario format (task E.1, AC-EVAL-01).
 * One JSON file per scenario in evaluation/scenarios/. Synthetic, respectful,
 * non-graphic (C-DAT-01, C-DAT-03). Labels need two team members to agree.
 *
 * Each scenario is a conversation (task M.4, PRODUCT_VISION.md §5): a plain string is the
 * person's turn; `{ sender: "OPERATOR", text }` is a question from NHAA's chatbot or operator.
 * Only the person's turns are scored (FR-CH-02). There are no structured answers.
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

const Turn = z.strictObject({ sender: z.enum(["OPERATOR", "VICTIM"]), text: z.string().min(1) });

export const ScenarioSchema = z
  .object({
    id: z.string().regex(/^S\d{3}$/),
    language: z.enum(["en", "hi", "hi-Latn", "mr", "ta", "bn"]),
    channel: z.enum(["CHATBOT", "PORTAL", "VOICE_CALL", "IVRS"]),
    /** For the fairness report only (NFR-ETH-04); never a risk feature */
    gender: z.enum(["F", "M", "OTHER", "UNDISCLOSED"]),
    summary: z.string().min(5),
    context: z.record(z.string(), z.union([z.boolean(), z.string()])).default({}),
    messages: z.array(z.union([z.string().min(1), Turn])).default([]),
    expected: z.object({
      band: Band,
      indicators: z.array(Dimension),
      recommendations: z.array(Support),
    }),
    /** "short-answer": the risk is mainly in short replies to operator questions (gap V7) */
    tags: z.array(z.enum(["negation", "dialect", "voice", "indirect", "context-only", "short-answer"])).default([]),
    /** Names or initials of the team members who agreed on the labels (need 2) */
    reviewedBy: z.array(z.string()).default([]),
  })
  .strict();

export type Scenario = z.infer<typeof ScenarioSchema>;

/** Every turn with its sender (a plain string is the person's turn). */
export function scenarioTurns(s: Pick<Scenario, "messages">): { sender: "VICTIM" | "OPERATOR"; text: string }[] {
  return s.messages.map((m) => (typeof m === "string" ? { sender: "VICTIM" as const, text: m } : m));
}
