/** Demo input layer contracts (API_CONTRACTS §6.5, tasks M.11, M.14). Not part of the module. */
import { z } from "zod";
import { ConsentRequest, VictimLang } from "./interaction";

export const DEMO_MODES = ["LIVE_TEXT", "RECORDED_AUDIO"] as const;
export const DemoMode = z.enum(DEMO_MODES);
export type DemoMode = z.infer<typeof DemoMode>;

/** The simulated NHAA source channel for each demo mode. */
export const DEMO_CHANNEL: Record<DemoMode, "CHATBOT" | "VOICE_CALL"> = { LIVE_TEXT: "CHATBOT", RECORDED_AUDIO: "VOICE_CALL" };

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
