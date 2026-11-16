/** Demo input layer contracts (API_CONTRACTS §6.5, tasks M.11, M.14). Not part of the module. */
import { z } from "zod";
import { ConsentRequest, EmergencyPanel, VictimLang } from "./interaction";

export const DEMO_MODES = ["LIVE_TEXT", "RECORDED_AUDIO", "LIVE_AUDIO"] as const;
export const DemoMode = z.enum(DEMO_MODES);
export type DemoMode = z.infer<typeof DemoMode>;

/** The simulated NHAA source channel for each demo mode. */
export const DEMO_CHANNEL: Record<DemoMode, "CHATBOT" | "VOICE_CALL"> = { LIVE_TEXT: "CHATBOT", RECORDED_AUDIO: "VOICE_CALL", LIVE_AUDIO: "VOICE_CALL" };

/** One live-microphone window (M.12): the caller's own channel, during the call. */
export const MAX_LIVE_WINDOW_BYTES = 200 * 1024;

export const DemoStart = z.object({
  mode: DemoMode,
  language: VictimLang,
  consent: ConsentRequest,
  /** Plan §8.4: the seeded district the case belongs to, so district, police and welfare portals receive it */
  districtCode: z.string().regex(/^[A-Z]{2}-[A-Z]{3}$/),
  scenarioId: z
    .string()
    .regex(/^S\d{3}$/)
    .optional(),
  /** A signed-in supervisor (`demo.use`) may take the live microphone line over (plan §7) */
  takeover: z.boolean().optional(),
});
export type DemoStart = z.infer<typeof DemoStart>;

export const DemoMessage = z.object({
  text: z.string().trim().min(1).max(2000),
  sender: z.enum(["VICTIM", "OPERATOR"]),
});

/** `fromWindow`: continue a recording where the previous request stopped (each request stays under the hosting time limit). */
const FromWindow = z.coerce.number().int().min(0).max(1_000).default(0);

export const DemoRecordingJson = z.object({ scenarioId: z.string().regex(/^S\d{3}$/), fromWindow: FromWindow });

export const RecordingFields = z.object({
  audioSource: z.enum(["CALLER_ONLY", "MIXED"]).default("MIXED"),
  firstSpeaker: z.enum(["OPERATOR", "CALLER"]).default("OPERATOR"),
  fromWindow: FromWindow,
});

/** Uploads go through the hosting body limit (Vercel: 4.5 MB); about 2 minutes of 16 kHz WAV. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** One NDJSON line of the recording stream. */
export type RecordingEvent =
  | { type: "start"; windows: number; durationMs: number; fromWindow: number }
  | {
      type: "window";
      windowIndex: number;
      startMs: number;
      endMs: number;
      status: number;
      analysed: boolean;
      error: string | null;
    }
  | { type: "done"; windows: number; analysed: number; showEmergencyPanel: boolean; emergency: EmergencyPanel | null }
  /** This request used its time; send the same recording again with `fromWindow: nextWindow` */
  | { type: "more"; nextWindow: number; windows: number }
  | { type: "error"; code: string; message: string };

/** GET /api/demo/track?docket= (plan §6.4): a docket number in NHAA's form. */
export const TrackQuery = z.object({ docket: z.string().trim().toUpperCase().regex(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/) });

/** What a public demo page may learn about one message or window: received, and the one allowed risk signal (rule 1). */
export const DemoReceipt = z.object({ ok: z.literal(true), showEmergencyPanel: z.boolean(), emergency: EmergencyPanel.nullable() });
export type DemoReceipt = z.infer<typeof DemoReceipt>;
