/**
 * Simulator case format (task S.2, FR-SIM-02). One JSON file per case in evaluation/simulator/.
 *
 * A case file is a SCRIPT and nothing else: what the caller says, types or presses, on which
 * channel, in which language, and the band the team EXPECTS. It never holds a result (SVI,
 * band, indicator, recommendation): those come only from the module when the case is played
 * (FR-SIM-04). `.strict()` rejects any extra field, so a result cannot be slipped in.
 *
 * Synthetic, respectful and non-graphic; no real names, no place below state level in the
 * script text (C-DAT-01, C-DAT-03). No caste or community field (rule 10).
 */
import { z } from "zod";
import { RiskBand } from "./common";

/** The five NHAA channels the simulator plays (a subset of the module's channels). */
export const SIM_CHANNELS = ["VOICE_CALL", "IVRS", "CHATBOT", "MOBILE_APP", "PORTAL"] as const;
export const SimChannel = z.enum(SIM_CHANNELS);
export type SimChannel = z.infer<typeof SimChannel>;

/** Script language. "hi-Latn" is Hinglish (romanised Hindi); it is sent to the module as "hi". */
export const SimLanguage = z.enum(["en", "hi", "hi-Latn", "mr", "ta", "bn"]);
export type SimLanguage = z.infer<typeof SimLanguage>;

/**
 * Where a spoken line's audio comes from (D10). PLACEHOLDER = not recorded yet; the file may be
 * missing and the case is marked "audio pending" until the team records it (task S.3).
 */
export const AudioSource = z.enum(["TTS", "TEAM_RECORDING", "PLACEHOLDER"]);
const AudioRef = z
  .object({
    file: z.string().regex(/^audio\/[a-z0-9][a-z0-9-]*\.(ogg|webm|wav|mp3)$/, "audio/<name>.(ogg|webm|wav|mp3)"),
    source: AudioSource,
  })
  .strict();

/** English gloss for reviewers who do not read the script language. Never shown as module output. */
const Gloss = z.string().trim().min(1);
const Pause = z.number().int().min(0).max(30_000).default(0);

const Speech = z
  .object({
    kind: z.literal("speech"),
    /** Exactly what is spoken; the module makes its own transcript from the audio */
    text: z.string().trim().min(1).max(600),
    gloss: Gloss.optional(),
    audio: AudioRef,
    /** C4 only: which take this line belongs to */
    take: z.string().regex(/^[a-z]+$/).optional(),
    pauseBeforeMs: Pause,
  })
  .strict();

const Message = z
  .object({
    kind: z.literal("message"),
    text: z.string().trim().min(1).max(2000), // integration API limit
    gloss: Gloss.optional(),
    pauseBeforeMs: Pause,
  })
  .strict();

/** A written complaint (portal): shown as a document, sent one paragraph per message. */
const Document = z
  .object({
    kind: z.literal("document"),
    paragraphs: z.array(z.string().trim().min(1).max(2000)).min(1).max(8),
    gloss: z.array(Gloss).optional(),
    pauseBeforeMs: Pause,
  })
  .strict();

/** An IVRS key press answering one screener or safety item. */
const Key = z
  .object({
    kind: z.literal("key"),
    itemCode: z.string().regex(/^[A-Z0-9_]+$/),
    /** The digit pressed, as the caller would: "1" yes / "2" no, or "0"–"3" on a scale; "*" skips */
    digit: z.enum(["0", "1", "2", "3", "*"]),
    pauseBeforeMs: Pause,
  })
  .strict();

export const SimStep = z.discriminatedUnion("kind", [Speech, Message, Document, Key]);
export type SimStep = z.infer<typeof SimStep>;

const Expected = z.union([
  z.object({ band: RiskBand }).strict(),
  /** C4: the same words in two takes; the voice reading should differ */
  z.object({ differentReadings: z.literal(true), note: z.string().min(5) }).strict(),
]);

export const SimCaseSchema = z
  .object({
    id: z.string().regex(/^C(0[1-9]|1[0-2])$/),
    title: z.string().trim().min(5).max(120),
    channel: SimChannel,
    language: SimLanguage,
    /** Seeded district code; routes the case to the district desks. Metadata only, never in the script. */
    districtCode: z.string().regex(/^[A-Z]{2}-[A-Z]{3}$/),
    /** One line: what the case shows the audience */
    proves: z.string().trim().min(10).max(200),
    /** Plain-English description of the case for the team */
    summary: z.string().trim().min(10).max(400),
    /** What the integrating NHAA system says it collected (the integration API requires it) */
    consent: z
      .object({
        textAnalysis: z.boolean(),
        voiceAnalysis: z.boolean(),
        shareWithCounsellor: z.boolean(),
        followUpContact: z.boolean(),
      })
      .strict(),
    takes: z
      .array(z.object({ id: z.string().regex(/^[a-z]+$/), label: z.string().min(2) }).strict())
      .optional(),
    steps: z.array(SimStep).min(1).max(40),
    expected: Expected,
    /** Team members who reviewed the script for tone and respect (task S.2 needs 2) */
    reviewedBy: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export type SimCase = z.infer<typeof SimCaseSchema>;

/** The language code the module is called with. */
export function apiLanguage(l: SimLanguage): "en" | "hi" | "mr" | "ta" | "bn" {
  return l === "hi-Latn" ? "hi" : l;
}
