/**
 * Victim API contracts (task 3.1, API_CONTRACTS.md §3).
 *
 * CLAUDE.md rule 1: no victim-facing response contains an SVI, band, indicator
 * names or diagnostic wording. Every response schema here is STRICT and every
 * victim handler parses its output through one of them, so an extra field
 * (e.g. `svi`) makes the request fail instead of leaking.
 */
import { z } from "zod";
import { ObjectIdStr } from "./common";

export const VICTIM_LANGS = ["en", "hi"] as const; // mr, ta, bn arrive in task 8.1
export const VictimLang = z.enum(VICTIM_LANGS);
export type VictimLang = z.infer<typeof VictimLang>;

export const VictimChannel = z.enum(["PORTAL", "CHATBOT", "IVRS", "MOBILE_APP"]);

// --- shared response pieces -------------------------------------------------

export const Prompt = z.strictObject({
  key: z.string(),
  text: z.string(),
  /** Optional lead-in shown above the question (e.g. the safety-check intro) */
  intro: z.string().optional(),
  audioUrl: z.string().optional(),
  input: z.enum(["FREE_TEXT", "YES_NO", "SCALE_0_3", "CHOICE", "CONTEXT_FORM", "NONE"]),
  choices: z.array(z.strictObject({ value: z.string(), label: z.string() })).optional(),
  skippable: z.boolean(),
  screener: z
    .strictObject({
      instrument: z.enum(["SAFETY_CHECK", "PHQ2", "GAD2", "PCPTSD5", "CSSRS_SCREEN"]),
      itemCode: z.string(),
    })
    .optional(),
});
export type Prompt = z.infer<typeof Prompt>;

export const EmergencyPanel = z.strictObject({
  numbers: z.array(z.strictObject({ label: z.string(), number: z.string() })),
  callbackAvailable: z.boolean(),
  message: z.string(),
});
export type EmergencyPanel = z.infer<typeof EmergencyPanel>;

export const ConsentNotice = z.strictObject({
  version: z.string(),
  language: VictimLang,
  title: z.string(),
  body: z.array(z.string()),
  audioUrl: z.string().optional(),
  options: z.array(z.enum(["textAnalysis", "voiceAnalysis", "shareWithCounsellor", "followUpContact", "audioRetention"])),
});

// --- §3.1 start ----------------------------------------------------------------

export const StartRequest = z.object({
  channel: VictimChannel.default("CHATBOT"),
  language: VictimLang,
  docketNumber: z.string().regex(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/).nullable().optional(),
  districtCode: z.string().max(20).nullable().optional(),
});

export const StartResponse = z.strictObject({
  interactionId: ObjectIdStr,
  docketNumber: z.string(),
  sessionToken: z.string().optional(), // IVRS / API channels only
  consentNotice: ConsentNotice,
  aiDisclosure: z.string(),
  quickExitUrl: z.string(),
});

// --- §3.3 / 3.4 consent ----------------------------------------------------------

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
export const ConsentResponse = z.strictObject({ mode: AssessmentModeOut, next: Prompt });
export const WithdrawRequest = z.object({ reason: z.string().max(200).nullable().optional() });
export const WithdrawResponse = z.strictObject({ mode: AssessmentModeOut, audioDeleted: z.boolean() });

// --- §3.5 next, §3.6 messages, §3.8 screeners, §3.9 context ------------------------

/** Every turn answers with the next scripted prompt and the emergency flag only. */
export const TurnResponse = z.strictObject({
  next: Prompt,
  showEmergencyPanel: z.boolean(),
  emergency: EmergencyPanel.nullable(),
});

export const NextResponse = z.strictObject({
  prompt: Prompt,
  showEmergencyPanel: z.boolean(),
  emergency: EmergencyPanel.nullable(),
});

export const MessageRequest = z
  .object({
    text: z.string().trim().max(2000).optional(),
    promptKey: z.string().max(100).optional(),
    /** Additive (API versioning rule): skip the current free-text question (FR-CH-09) */
    skipped: z.boolean().optional(),
    /** Additive (task 7.1): the person finished answering this question by voice */
    voiceDone: z.boolean().optional(),
  })
  .refine((m) => m.skipped === true || m.voiceDone === true || (m.text?.length ?? 0) > 0, { message: "text is required unless skipped" });

export const MessageResponse = z.strictObject({
  messageId: ObjectIdStr.nullable(),
  reply: Prompt,
  showEmergencyPanel: z.boolean(),
  emergency: EmergencyPanel.nullable(),
});

export const ScreenerRequest = z.object({
  instrument: z.enum(["SAFETY_CHECK", "PHQ2", "GAD2", "PCPTSD5", "CSSRS_SCREEN"]),
  itemCode: z.string().regex(/^[A-Z0-9_]{3,40}$/),
  value: z.number().int().min(0).max(3).nullable(),
  skipped: z.boolean().default(false),
});

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

export const LanguageRequest = z.object({ language: VictimLang });
export const LanguageResponse = z.strictObject({ next: Prompt });

export const CallbackRequest = z.object({
  phone: z.string().trim().regex(/^\+?[0-9 -]{10,16}$/, "must be a phone number"),
  preferredLanguage: VictimLang.optional(),
});
export const CallbackResponse = z.strictObject({ requested: z.boolean(), message: z.string() });

export const EndRequest = z.object({ reason: z.enum(["COMPLETED", "QUICK_EXIT", "TIMEOUT"]) });
export const EndResponse = z.strictObject({ docketNumber: z.string(), closingMessage: z.string(), trackUrl: z.string() });

/** Field names that must never appear anywhere in a victim response (rule 1). */
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

/** §3.7 audio chunk: form fields other than the file (task 7.5). */
export const AudioFields = z.object({
  windowIndex: z.coerce.number().int().min(0).max(10_000),
  startMs: z.coerce.number().int().min(0).max(4 * 3_600_000),
});

/** 202 for a voice chunk: the victim's own words back, and only the emergency signal (rule 1). */
export const AudioResponse = z.strictObject({
  windowIndex: z.number().int(),
  transcript: z.string().nullable(),
  /** false when voice analysis is unavailable: the page offers typing instead (NFR-REL-02) */
  analysed: z.boolean(),
  showEmergencyPanel: z.boolean(),
  emergency: EmergencyPanel.nullable(),
});
