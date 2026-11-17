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

export const DemoMessage = z.object({
  text: z.string().trim().min(1).max(2000),
  sender: z.enum(["VICTIM", "OPERATOR"]),
});

/** GET /api/demo/track?docket= (plan §6.4): a docket number in NHAA's form. */
export const TrackQuery = z.object({ docket: z.string().trim().toUpperCase().regex(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/) });

/** What a public demo page may learn about one message or window: received, and the one allowed risk signal (rule 1). */
export const DemoReceipt = z.object({ ok: z.literal(true), showEmergencyPanel: z.boolean(), emergency: EmergencyPanel.nullable() });
export type DemoReceipt = z.infer<typeof DemoReceipt>;
