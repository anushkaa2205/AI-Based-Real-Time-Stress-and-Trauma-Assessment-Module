/**
 * Shared interaction contracts used by the integration API (API_CONTRACTS.md §2, §6).
 * The module has no victim-facing API (PRODUCT_VISION.md §5). What a calling system may
 * show the person (the emergency options) is defined here, and the response schemas
 * of the input endpoints are STRICT so an extra field such as `svi` fails instead of
 * leaking (CLAUDE.md rule 1).
 */
import { z } from "zod";

export const VICTIM_LANGS = ["en", "hi", "mr", "ta", "bn"] as const; // FR-LANG-01 (task 8.1)
export const VictimLang = z.enum(VICTIM_LANGS);
export type VictimLang = z.infer<typeof VictimLang>;

/** A stored language code → a supported language (English if unknown). */
export function toVictimLang(code: unknown): VictimLang {
  return (VICTIM_LANGS as readonly string[]).includes(String(code)) ? (code as VictimLang) : "en";
}

/** Emergency options for the calling system to show the person (FR-REC-06): numbers and calm wording only. */
export const EmergencyPanel = z.strictObject({
  numbers: z.array(z.strictObject({ label: z.string(), number: z.string() })),
  message: z.string(),
});
export type EmergencyPanel = z.infer<typeof EmergencyPanel>;

// --- consent (API_CONTRACTS §6.1) -------------------------------------------------

export const ConsentRequest = z.object({
  noticeVersion: z.string().min(1),
  language: VictimLang,
  textAnalysis: z.boolean(),
  voiceAnalysis: z.boolean(),
  shareWithCounsellor: z.boolean(),
  followUpContact: z.boolean(),
  audioRetention: z.boolean().default(false),
  guardianConsent: z.boolean().nullable().optional(),
});
export type ConsentRequest = z.infer<typeof ConsentRequest>;

export const AssessmentModeOut = z.enum(["SAFETY_ONLY", "TEXT_ONLY", "VOICE_ONLY", "FULL"]);
export const WithdrawRequest = z.object({ reason: z.string().max(200).nullable().optional() });
export const WithdrawResponse = z.strictObject({ mode: AssessmentModeOut, audioDeleted: z.boolean() });

// --- case context from NHAA's record (API_CONTRACTS §6.4, FR-CH-08) -----------------

export const ContextRequest = z
  .object({
    offenceCategory: z.enum(["THREAT_INTIMIDATION", "PHYSICAL_ATTACK", "SEXUAL_VIOLENCE", "SOCIAL_BOYCOTT", "PROPERTY_DAMAGE", "OTHER"]),
    ageGroup: z.enum(["UNDER_18", "18_59", "60_PLUS"]),
    gender: z.enum(["F", "M", "OTHER", "UNDISCLOSED"]),
    hasDisability: z.boolean(),
    supportPersonPresent: z.boolean(),
    accusedNearby: z.boolean(),
    ongoingThreats: z.boolean(),
    pressureToWithdraw: z.boolean(),
    displaced: z.boolean(),
    familyMemberKilled: z.boolean(),
  })
  .partial()
  .strict();
export type ContextRequest = z.infer<typeof ContextRequest>;

/** Field names that must never appear in a response a calling system may show the person (rule 1). */
export const FORBIDDEN_VICTIM_FIELDS = [
  "svi",
  "band",
  "computedBand",
  "dimension",
  "dimensions",
  "indicator",
  "indicators",
  "overridesFired",
  "confidence",
  "explanation",
  "topEvidence",
] as const;

// --- audio windows (API_CONTRACTS §6.3) --------------------------------------------

/** Form fields other than the file (task 7.5). */
export const AudioFields = z.object({
  windowIndex: z.coerce.number().int().min(0).max(10_000),
  startMs: z.coerce.number().int().min(0).max(4 * 3_600_000),
  /** Task M.10 (FR-VOI-10): MIXED (both voices, the default) or CALLER_ONLY (the caller's channel) */
  audioSource: z.enum(["CALLER_ONLY", "MIXED"]).default("MIXED"),
  /** Which voice speaks first in a MIXED call; the helpline usually answers first */
  firstSpeaker: z.enum(["OPERATOR", "CALLER"]).default("OPERATOR"),
});

/** 202 for a voice window: the transcript back, and only the emergency signal (rule 1). */
export const AudioResponse = z.strictObject({
  windowIndex: z.number().int(),
  transcript: z.string().nullable(),
  /** false when voice analysis was unavailable for this window (NFR-REL-02) */
  analysed: z.boolean(),
  showEmergencyPanel: z.boolean(),
  emergency: EmergencyPanel.nullable(),
});
