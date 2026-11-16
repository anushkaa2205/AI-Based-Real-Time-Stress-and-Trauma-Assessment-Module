/** Demo input layer contracts (API_CONTRACTS §6.5, tasks M.11, M.14). Not part of the module. */
import { z } from "zod";
import { ConsentRequest, VictimLang } from "./interaction";

export const DEMO_MODES = ["LIVE_TEXT", "RECORDED_AUDIO", "LIVE_AUDIO", "GENERATED_TEXT"] as const;
export const DemoMode = z.enum(DEMO_MODES);
export type DemoMode = z.infer<typeof DemoMode>;

/** The simulated NHAA source channel for each demo mode. */
export const DEMO_CHANNEL: Record<DemoMode, "CHATBOT" | "VOICE_CALL"> = { LIVE_TEXT: "CHATBOT", RECORDED_AUDIO: "VOICE_CALL", LIVE_AUDIO: "VOICE_CALL", GENERATED_TEXT: "CHATBOT" };

/** One live-microphone window (M.12): the caller's own channel, during the call. */
export const MAX_LIVE_WINDOW_BYTES = 200 * 1024;

export const DemoStart = z.object({
  mode: DemoMode,
  language: VictimLang,
  consent: ConsentRequest,
  scenarioId: z
    .string()
    .regex(/^S\d{3}$/)
    .optional(),
});
export type DemoStart = z.infer<typeof DemoStart>;

export const DemoMessage = z.object({
  text: z.string().trim().min(1).max(2000),
  sender: z.enum(["VICTIM", "OPERATOR"]),
});

export const DemoRecordingJson = z.object({ scenarioId: z.string().regex(/^S\d{3}$/) });

export const RecordingFields = z.object({
  audioSource: z.enum(["CALLER_ONLY", "MIXED"]).default("MIXED"),
  firstSpeaker: z.enum(["OPERATOR", "CALLER"]).default("OPERATOR"),
});

/** Uploads go through the hosting body limit (Vercel: 4.5 MB); about 2 minutes of 16 kHz WAV. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export interface DemoCall {
  requestId: string | null;
  ms: number;
}

/** One NDJSON line of the recording stream. */
export type RecordingEvent =
  | { type: "start"; windows: number; durationMs: number; source: "library" | "upload"; scenarioId: string | null }
  | {
      type: "window";
      windowIndex: number;
      startMs: number;
      endMs: number;
      status: number;
      analysed: boolean;
      transcript: string | null;
      error: string | null;
      call: DemoCall;
    }
  | { type: "done"; windows: number; analysed: number }
  | { type: "error"; code: string; message: string };

/** Task M.13: options for a generated synthetic conversation (the analysis service checks them again). */
export const GENERATE_CATEGORIES = ["THREAT_INTIMIDATION", "PHYSICAL_ATTACK", "SOCIAL_BOYCOTT", "PROPERTY_DAMAGE", "PRESSURE_TO_WITHDRAW", "CASE_STATUS"] as const;
export const DemoGenerate = z.object({
  category: z.enum(GENERATE_CATEGORIES),
  language: VictimLang,
  length: z.enum(["short", "medium", "long"]),
  tone: z.enum(["calm", "worried", "distressed"]),
});
export type DemoGenerate = z.infer<typeof DemoGenerate>;
