/**
 * Safety net for speaker separation (task M.10, FR-VOI-10, CLAUDE.md rule 4, NFR-ETH-05).
 *
 * In a two-voice call the operator's words are not scored. If the separation ever labelled the
 * caller's words as the operator's, a life-safety statement could be lost. The lexicon rules are
 * first-person statements ("I want to die", "they are standing outside my house"), which an
 * operator's question ("are you thinking of ending your life?") does not match. So if words labelled
 * as the operator's DO match a life-safety rule, they are treated as the caller's (a false alarm is
 * preferred to a miss) and the call is marked limited confidence. Pure: no database, no clock.
 */
import type { OverrideFlag } from "@/core/scoring/types";
import { lexiconSignals } from "./engine";

/** Flags whose loss would hide immediate danger or suicide risk. */
const LIFE_SAFETY: ReadonlySet<OverrideFlag> = new Set<OverrideFlag>([
  "SUICIDAL_INTENT",
  "PASSIVE_SUICIDAL_IDEATION",
  "ACCUSED_PRESENT",
  "CONFINED",
  "SERIOUS_INJURY",
  "THREAT_TO_LIFE",
  "NOT_SAFE_NOW",
]);

/** Words that open a question in the six lexicon languages (some lexicon rules are not first-person). */
const QUESTION_START = /^(?:are|is|do|does|did|have|has|can|could|would|will|were|was|any|anyone)\b|^(?:क्या|kya|ky[aā])\b|^(?:तुम्ही|तू)\b.*का\s*$|^(?:আপনি কি|আপনার কি|তুমি কি)/iu;

/** Sentences of a transcript, with where each one starts. */
function sentences(text: string): { start: number; end: number; s: string }[] {
  const out: { start: number; end: number; s: string }[] = [];
  const re = /[^.!?।]+[.!?।]*/gu;
  for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, s: m[0].trim() });
  return out;
}

const isQuestion = (s: string) => s.endsWith("?") || QUESTION_START.test(s.replace(/[?.!।\s]+$/u, ""));

/**
 * True if text labelled as the operator's holds a life-safety statement that is not a question.
 * Questions are what operators ask ("क्या आपको चोट लगी है?" matches an injury rule), so they never count.
 */
export function operatorTextNeedsScoring(text: string): boolean {
  if (!text.trim()) return false;
  const parts = sentences(text);
  return lexiconSignals(text).indicators.some((i) => {
    if (i.negated || !(i.flags ?? []).some((f) => LIFE_SAFETY.has(f))) return false;
    const sentence = parts.find((p) => i.evidence.start >= p.start && i.evidence.start < p.end);
    return !(sentence && isQuestion(sentence.s));
  });
}
