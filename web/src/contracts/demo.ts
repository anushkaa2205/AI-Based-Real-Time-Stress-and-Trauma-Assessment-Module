/** Demo input layer contracts (API_CONTRACTS §6.5; tasks M.11, N.4, P.2). Not part of the module. */
import { z } from "zod";
import { ConsentRequest, EmergencyPanel, VictimLang } from "./interaction";

/** Two public inputs since Phase P (P-D3): write (live text) and speak (live microphone). No recordings. */
export const DEMO_MODES = ["LIVE_TEXT", "LIVE_AUDIO"] as const;
export const DemoMode = z.enum(DEMO_MODES);
export type DemoMode = z.infer<typeof DemoMode>;

/** The simulated NHAA source channel for each demo mode. */
export const DEMO_CHANNEL: Record<DemoMode, "CHATBOT" | "VOICE_CALL"> = { LIVE_TEXT: "CHATBOT", LIVE_AUDIO: "VOICE_CALL" };

/** One live-microphone window (M.12): the caller's own channel, during the call. */
export const MAX_LIVE_WINDOW_BYTES = 200 * 1024;

export const DemoStart = z.object({
  mode: DemoMode,
  language: VictimLang,
  consent: ConsentRequest,
  /** Plan §8.4: the seeded district the case belongs to, so district, police and welfare portals receive it */
  districtCode: z.string().regex(/^[A-Z]{2}-[A-Z]{3}$/),
  /** A signed-in supervisor (`demo.use`) may take the live microphone line over (plan §7) */
  takeover: z.boolean().optional(),
});
export type DemoStart = z.infer<typeof DemoStart>;

/**
 * Phase P (P-D4, plan §8.3): the person's own words only. There is no `sender`: only the server
 * records the assistant's questions as OPERATOR turns. `note: true` marks the Review note, after
 * which no further question is asked.
 */
export const DemoMessage = z
  .object({
    text: z.string().trim().min(1).max(2000),
    note: z.boolean().optional(),
  })
  .strict();

/** The text of the assistant's next question; never its key or why it was chosen (plan §7). */
export const DemoQuestion = z.object({ text: z.string() }).strict();
export type DemoQuestion = z.infer<typeof DemoQuestion>;

/** GET /api/demo/track?docket= (plan §6.4): a docket number in NHAA's form. */
export const TrackQuery = z.object({ docket: z.string().trim().toUpperCase().regex(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/) });

/**
 * What a public demo page may learn about one message: received, the one allowed risk signal
 * (rule 1) and the assistant's next question (Phase P). Nothing about the assessment.
 */
export const DemoReceipt = z
  .object({ ok: z.literal(true), showEmergencyPanel: z.boolean(), emergency: EmergencyPanel.nullable(), question: DemoQuestion.nullable() })
  .strict();
export type DemoReceipt = z.infer<typeof DemoReceipt>;

/** One live window (Phase P): `heard` is the person's own words for that window (the caller's words only), for "We heard" and Review. */
export const DemoAudioReceipt = z
  .object({ ok: z.literal(true), analysed: z.boolean(), showEmergencyPanel: z.boolean(), emergency: EmergencyPanel.nullable(), heard: z.string() })
  .strict();
export type DemoAudioReceipt = z.infer<typeof DemoAudioReceipt>;

/** POST /api/demo/interactions → 201 */
export const DemoStarted = z.object({ interactionId: z.string(), question: DemoQuestion.nullable() }).strict();
export type DemoStarted = z.infer<typeof DemoStarted>;

/** POST /api/demo/interactions/{id}/next-question → 200 */
export const DemoNextQuestion = z.object({ question: DemoQuestion.nullable() }).strict();
export type DemoNextQuestion = z.infer<typeof DemoNextQuestion>;
