/**
 * Suggested next questions for the operator console (task 7.5, FR-CH-04, API_CONTRACTS §5.3).
 * Pure: no database, no clock. The questions are the same scripted, pre-translated prompts
 * the victim flow uses (CLAUDE.md rule 2); the AI never writes them.
 *
 * Order: safety first, then whatever the evidence points at and has not been asked yet.
 */
import type { Dimension } from "@/core/scoring/types";

export interface SuggestInput {
  /** itemCode → answer (null = skipped); missing = not asked */
  answered: ReadonlyMap<string, number | null>;
  /** latest fused dimension scores (0–1) */
  dimensions: Partial<Record<Dimension, number>>;
  suicideSignal: boolean;
}

export interface Suggestion {
  /** i18n key of the question (messages/*.json) */
  key: string;
  /** why it is suggested, for the operator (staff-facing) */
  reason: string;
}

export const MAX_SUGGESTIONS = 3;

const screener = (code: string) => `flow.screener.${code}`;

export function suggestQuestions(input: SuggestInput): Suggestion[] {
  const out: Suggestion[] = [];
  const asked = (code: string) => input.answered.has(code);
  const d = (dim: Dimension) => input.dimensions[dim] ?? 0;
  const add = (key: string, reason: string) => {
    if (!out.some((s) => s.key === key)) out.push({ key, reason });
  };

  // 1. Safety check (FR-SCR-01): always first until answered.
  if (!asked("SAFETY_SAFE_NOW")) add(screener("SAFETY_SAFE_NOW"), "Safety check not done yet");
  if (!asked("SAFETY_ACCUSED_NEARBY")) add(screener("SAFETY_ACCUSED_NEARBY"), "Safety check not done yet");

  // 2. Suicide risk: any sign → ask directly (asking does not increase risk).
  if (input.suicideSignal || d("SUICIDAL_IDEATION") >= 0.3) {
    if (!asked("SAFETY_SUICIDAL_THOUGHTS")) add(screener("SAFETY_SUICIDAL_THOUGHTS"), "Signs of suicidal thoughts");
    else if (input.answered.get("SAFETY_SUICIDAL_THOUGHTS") === 1 && !asked("SAFETY_SUICIDAL_INTENT"))
      add(screener("SAFETY_SUICIDAL_INTENT"), "Said yes to suicidal thoughts: ask about intent or plan");
  }

  // 3. Not safe now → a safe place.
  if (input.answered.get("SAFETY_SAFE_NOW") === 0) add("suggest.safePlace", "Said they are not safe right now");

  // 4. What the evidence points at.
  if (d("INTIMIDATION") >= 0.5) add("suggest.threatDetails", "Signs of threats or intimidation");
  if (d("FEAR_ANXIETY") >= 0.4 && !asked("GAD2_1")) add(screener("GAD2_1"), "Signs of fear or anxiety");
  if (d("DEPRESSION") >= 0.4 && !asked("PHQ2_1")) add(screener("PHQ2_1"), "Signs of low mood");
  if (d("SEVERE_TRAUMA") >= 0.4 && !asked("PCPTSD5_1")) add(screener("PCPTSD5_1"), "Signs of trauma");
  if (d("SOCIAL_ISOLATION") >= 0.4) add("suggest.whoCanHelp", "Signs of isolation or boycott");
  if (d("EXTREME_VULNERABILITY") >= 0.5) add("suggest.injury", "Signs of injury or extreme vulnerability");

  // 5. Nothing specific: invite them to say more.
  if (!out.length) add("flow.narrative.more", "No open safety question; invite them to say more");
  return out.slice(0, MAX_SUGGESTIONS);
}
