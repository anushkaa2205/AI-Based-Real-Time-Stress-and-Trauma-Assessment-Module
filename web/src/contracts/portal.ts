/** Nivara portal contracts (API_CONTRACTS §6.5; tasks M.11, N.4, P.2). Not part of the module. */
import { z } from "zod";
import { ConsentRequest, EmergencyPanel, VictimLang } from "./interaction";

/** Two public inputs since Phase P (P-D3): write (live text) and speak (live microphone). No recordings. */
export const PORTAL_MODES = ["LIVE_TEXT", "LIVE_AUDIO"] as const;
export const PortalMode = z.enum(PORTAL_MODES);
export type PortalMode = z.infer<typeof PortalMode>;

/** The NHAA source channel each portal input mode stands for. */
export const PORTAL_CHANNEL: Record<PortalMode, "CHATBOT" | "VOICE_CALL"> = { LIVE_TEXT: "CHATBOT", LIVE_AUDIO: "VOICE_CALL" };

/** One live-microphone window (M.12): the caller's own channel, during the call. */
export const MAX_LIVE_WINDOW_BYTES = 200 * 1024;

export const PortalStart = z.object({
  mode: PortalMode,
  language: VictimLang,
  consent: ConsentRequest,
  /** Plan §8.4: the seeded district the case belongs to, so district, police and welfare portals receive it */
  districtCode: z.string().regex(/^[A-Z]{2}-[A-Z]{3}$/),
  /** A signed-in supervisor (`portal.takeover`) may take the live microphone line over (plan §7) */
  takeover: z.boolean().optional(),
});
export type PortalStart = z.infer<typeof PortalStart>;

/**
 * Phase P (P-D4, plan §8.3): the person's own words only. There is no `sender`: only the server
 * records the assistant's questions as OPERATOR turns. `note: true` marks the Review note, after
 * which no further question is asked.
 */
export const PortalMessage = z
  .object({
    text: z.string().trim().min(1).max(2000),
    note: z.boolean().optional(),
  })
  .strict();

/** The text of the assistant's next question; never its key or why it was chosen (plan §7). */
export const PortalQuestion = z.object({ text: z.string() }).strict();
export type PortalQuestion = z.infer<typeof PortalQuestion>;

/** GET /api/portal/track?docket= (plan §6.4): a docket number in NHAA's form. */
export const TrackQuery = z.object({ docket: z.string().trim().toUpperCase().regex(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/) });

/**
 * What a public portal page may learn about one message: received, the one allowed risk signal
 * (rule 1) and the assistant's next question (Phase P). Nothing about the assessment.
 */
export const PortalReceipt = z
  .object({ ok: z.literal(true), showEmergencyPanel: z.boolean(), emergency: EmergencyPanel.nullable(), question: PortalQuestion.nullable() })
  .strict();
export type PortalReceipt = z.infer<typeof PortalReceipt>;

/** One live window (Phase P): `heard` is the person's own words for that window (the caller's words only), for "We heard" and Review. */
export const PortalAudioReceipt = z
  .object({ ok: z.literal(true), analysed: z.boolean(), showEmergencyPanel: z.boolean(), emergency: EmergencyPanel.nullable(), heard: z.string() })
  .strict();
export type PortalAudioReceipt = z.infer<typeof PortalAudioReceipt>;

/** POST /api/portal/interactions → 201 */
export const PortalStarted = z.object({ interactionId: z.string(), question: PortalQuestion.nullable() }).strict();
export type PortalStarted = z.infer<typeof PortalStarted>;

/** POST /api/portal/interactions/{id}/next-question → 200 */
export const PortalNextQuestion = z.object({ question: PortalQuestion.nullable() }).strict();
export type PortalNextQuestion = z.infer<typeof PortalNextQuestion>;

/** POST /api/portal/interactions/{id}/language (task P.11, plan §6.7): the site language changed mid-conversation. */
export const PortalLanguage = z.object({ language: VictimLang }).strict();
export type PortalLanguage = z.infer<typeof PortalLanguage>;

/** → 200: the text of the assistant's questions asked so far, in order, in the new language. Never their keys. */
export const PortalLanguageResult = z.object({ questions: z.array(z.string()) }).strict();
export type PortalLanguageResult = z.infer<typeof PortalLanguageResult>;
