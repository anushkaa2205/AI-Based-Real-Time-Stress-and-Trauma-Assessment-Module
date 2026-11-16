/**
 * Suggested next questions for the operator console (task 7.5, FR-CH-04, FR-DSH-01, API_CONTRACTS §5.3).
 * Pure: no database, no clock. The questions are scripted and pre-translated (`operatorQuestions.*` in
 * messages/*.json; CLAUDE.md rule 2); the AI never writes them. The operator asks them ALOUD; the module
 * never asks the person anything and has no structured answers (PRODUCT_VISION.md §5).
 *
 * Until short answers are read with their question (gap V7, task M.9) the module cannot tell which
 * questions were already asked, so the safety questions stay at the top.
 * Order: safety first, then whatever the evidence points at.
 */
import type { Dimension } from "@/core/scoring/types";

export interface SuggestInput {
  /** latest fused dimension scores (0–1) */
  dimensions: Partial<Record<Dimension, number>>;
  /** any sign of suicidal thoughts so far */
  suicideSignal: boolean;
  /** OV-9 fired: the person said they are not safe right now */
  notSafeNow: boolean;
}

export interface Suggestion {
  /** i18n key of the question (messages/*.json) */
  key: string;
  /** why it is suggested, for the operator (staff-facing) */
  reason: string;
}

export const MAX_SUGGESTIONS = 3;

const q = (name: string) => `operatorQuestions.${name}`;

export function suggestQuestions(input: SuggestInput): Suggestion[] {
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
  return out.slice(0, MAX_SUGGESTIONS);
}
