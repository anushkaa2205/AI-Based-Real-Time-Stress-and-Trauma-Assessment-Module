/**
 * Suggested next questions for the operator console (task 7.5, FR-CH-04, FR-DSH-01, API_CONTRACTS §5.3).
 * Pure: no database, no clock. The questions are scripted and pre-translated (`operatorQuestions.*` in
 * messages/*.json; CLAUDE.md rule 2); the AI never writes them. The operator asks them ALOUD; the module
 * never asks the person anything and has no structured answers (PRODUCT_VISION.md §5).
 *
 * Since M.9 the module stores the questions asked (OPERATOR turns), so a question already asked in the
 * interaction is not suggested again (`asked`, filled by `askedKeys` in ./asked).
 * Order: safety first, then whatever the evidence points at.
 *
 * Phase P (task P.3, FR-API-07, API_CONTRACTS §6.7): the same rules choose the next question for a
 * calling system's chatbot (`nextChatbotQuestion`). The module suggests; the calling system asks.
 */
import type { Dimension } from "@/core/scoring/types";

export interface SuggestInput {
  /** latest fused dimension scores (0–1) */
  dimensions: Partial<Record<Dimension, number>>;
  /** any sign of suicidal thoughts so far */
  suicideSignal: boolean;
  /** OV-9 fired: the person said they are not safe right now */
  notSafeNow: boolean;
  /** Keys already asked in this interaction (OPERATOR turns); never suggested again */
  asked?: readonly string[];
}

export interface Suggestion {
  /** i18n key of the question (messages/*.json) */
  key: string;
  /** why it is suggested, for the operator (staff-facing) */
  reason: string;
}

export const MAX_SUGGESTIONS = 3;
/** Plan §8.2: a chatbot asks at most this many scripted questions in one interaction (the opening included). */
export const MAX_CHATBOT_QUESTIONS = 6;
/** The first line a chatbot shows when nothing has been said yet. */
export const OPENING_KEY = "operatorQuestions.opening";

const q = (name: string) => `operatorQuestions.${name}`;

/** Every suggestion in order, before `asked` and the cap are applied. */
function rankQuestions(input: SuggestInput): Suggestion[] {
  const out: Suggestion[] = [];
  const d = (dim: Dimension) => input.dimensions[dim] ?? 0;
  const add = (key: string, reason: string) => {
    if (!out.some((s) => s.key === key)) out.push({ key, reason });
  };

  // 1. Safety (formerly the structured safety check): always at the top.
  if (input.notSafeNow) add(q("safePlace"), "Said they are not safe right now");
  else add(q("safeNow"), "Check safety first");

  // 2. Suicide risk: any sign → ask directly (asking does not increase risk).
  if (input.suicideSignal || d("SUICIDAL_IDEATION") >= 0.3) {
    add(q("suicidalThoughts"), "Signs of suicidal thoughts");
    if (d("SUICIDAL_IDEATION") >= 0.5) add(q("suicidalIntent"), "Clear signs of suicidal thoughts: ask about intent or plan");
  }

  // 3. Immediate danger from the accused.
  add(q("accusedNearby"), "Check whether the accused is nearby");

  // 4. What the evidence points at.
  if (d("INTIMIDATION") >= 0.5) add(q("threatDetails"), "Signs of threats or intimidation");
  // Wellbeing questions (PHQ-2, GAD-2, PC-PTSD-5 wording): the answers are read with them (task M.9).
  if (d("FEAR_ANXIETY") >= 0.4) add(q("nervous"), "Signs of fear or anxiety");
  if (d("DEPRESSION") >= 0.4) add(q("lowInterest"), "Signs of low mood");
  if (d("SEVERE_TRAUMA") >= 0.4) add(q("badDreams"), "Signs of trauma");
  if (d("SOCIAL_ISOLATION") >= 0.4) add(q("whoCanHelp"), "Signs of isolation or boycott");
  if (d("EXTREME_VULNERABILITY") >= 0.5) add(q("injury"), "Signs of injury or extreme vulnerability");

  // 5. Otherwise, invite them to say more.
  add(q("sayMore"), "Invite them to say more");
  return out;
}

/** The operator console's suggestions (FR-CH-04): the top few that have not been asked yet. */
export function suggestQuestions(input: SuggestInput): Suggestion[] {
  const asked = new Set(input.asked ?? []);
  return rankQuestions(input)
    .filter((s) => !asked.has(s.key))
    .slice(0, MAX_SUGGESTIONS);
}

export interface NextQuestionInput extends SuggestInput {
  /** Turns stored in the interaction so far (any sender) */
  turns: number;
  asked: readonly string[];
}

/**
 * The next scripted question for a calling system's chatbot (plan §8.2): the opening when nothing has
 * been said yet; then the first suggestion not asked yet; `null` after MAX_CHATBOT_QUESTIONS or when
 * nothing is left. Returns a key only; the caller adds the scripted wording.
 */
export function nextChatbotQuestion(input: NextQuestionInput): string | null {
  if (input.turns === 0) return OPENING_KEY;
  if (input.asked.length >= MAX_CHATBOT_QUESTIONS) return null;
  const asked = new Set(input.asked);
  return rankQuestions(input).find((s) => !asked.has(s.key))?.key ?? null;
}
