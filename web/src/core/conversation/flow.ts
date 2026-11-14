/**
 * Conversation engine (task 3.4, FR-CH-01/09/10, NFR-ETH-06, ADR-3).
 * Pure: facts about the interaction in, the next scripted prompt out.
 *
 *   consent → safety check → optional context → open narrative (≤ 3 turns)
 *   → adaptive screeners (only with analysis consent) → close
 *
 * The AI never talks to the victim (CLAUDE.md rule 2): every prompt is an i18n
 * key. Every question can be skipped. The person is asked to tell their story
 * once; follow-ups only ask "anything else?" (FR-CH-10).
 */
import type { Prompt, VictimLang } from "@/contracts/victim";
import { allowsScreeners } from "@/core/consent/mode";
import { t } from "@/core/i18n/messages";
import { ITEM_BY_CODE, type ScreenerItem } from "@/core/screeners/items";
import type { AssessmentMode } from "@/models/enums";

export const MAX_NARRATIVE_TURNS = 3;

/** Persisted in interactions.flowState */
export interface FlowState {
  contextDone: boolean;
  narrativeTurns: number;
  narrativeDone: boolean;
  /** Sticky: a sign of suicidal thoughts was seen, so the suicide-risk screen is offered */
  suicideSignal: boolean;
  closed: boolean;
}

export const INITIAL_FLOW: FlowState = {
  contextDone: false,
  narrativeTurns: 0,
  narrativeDone: false,
  suicideSignal: false,
  closed: false,
};

export function flowStateOf(raw: unknown): FlowState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<FlowState>;
  return {
    contextDone: s.contextDone === true,
    narrativeTurns: Number.isInteger(s.narrativeTurns) ? (s.narrativeTurns as number) : 0,
    narrativeDone: s.narrativeDone === true,
    suicideSignal: s.suicideSignal === true,
    closed: s.closed === true,
  };
}

export interface FlowFacts {
  consentGiven: boolean;
  mode: AssessmentMode;
  /** itemCode → value (null = skipped) */
  answered: ReadonlyMap<string, number | null>;
  state: FlowState;
}

export type Step =
  | { kind: "CONSENT" }
  | { kind: "SCREENER"; item: ScreenerItem }
  | { kind: "CONTEXT" }
  | { kind: "NARRATIVE"; followUp: boolean }
  | { kind: "CLOSE" };

const SAFETY = ["SAFETY_SAFE_NOW", "SAFETY_ACCUSED_NEARBY", "SAFETY_SUICIDAL_THOUGHTS", "SAFETY_SUICIDAL_INTENT"];
const SCREENERS = [
  "PHQ2_1",
  "PHQ2_2",
  "GAD2_1",
  "GAD2_2",
  "PCPTSD5_1",
  "PCPTSD5_2",
  "PCPTSD5_3",
  "PCPTSD5_4",
  "PCPTSD5_5",
];
const CSSRS = ["CSSRS_1", "CSSRS_2", "CSSRS_3", "CSSRS_4", "CSSRS_5", "CSSRS_6"];

function firstUnanswered(codes: readonly string[], answered: FlowFacts["answered"]): ScreenerItem | null {
  for (const code of codes) {
    if (answered.has(code)) continue;
    const item = ITEM_BY_CODE.get(code);
    if (!item) continue;
    // Follow-up items are asked only after a "yes" to their parent
    if (item.askIf && answered.get(item.askIf) !== 1) continue;
    return item;
  }
  return null;
}

export function nextStep(f: FlowFacts): Step {
  if (f.state.closed) return { kind: "CLOSE" };
  if (!f.consentGiven) return { kind: "CONSENT" };

  // FR-SCR-01: the safety check comes first and runs in every mode
  const safety = firstUnanswered(SAFETY, f.answered);
  if (safety) return { kind: "SCREENER", item: safety };

  if (!f.state.contextDone) return { kind: "CONTEXT" };

  if (!f.state.narrativeDone && f.state.narrativeTurns < MAX_NARRATIVE_TURNS) {
    return { kind: "NARRATIVE", followUp: f.state.narrativeTurns > 0 };
  }

  if (allowsScreeners(f.mode)) {
    const suicideSignal = f.state.suicideSignal || f.answered.get("SAFETY_SUICIDAL_THOUGHTS") === 1;
    const next = firstUnanswered(suicideSignal ? [...CSSRS, ...SCREENERS] : SCREENERS, f.answered);
    if (next) return { kind: "SCREENER", item: next };
  }

  return { kind: "CLOSE" };
}

/** Renders a step as a localised prompt. */
export function promptFor(step: Step, lang: VictimLang): Prompt {
  switch (step.kind) {
    case "CONSENT":
      return { key: "consent.title", text: t(lang, "consent.title"), input: "NONE", skippable: false };
    case "CONTEXT":
      return { key: "flow.context.intro", text: t(lang, "flow.context.intro"), input: "CONTEXT_FORM", skippable: true };
    case "NARRATIVE": {
      const key = step.followUp ? "flow.narrative.more" : "flow.narrative.open";
      return { key, text: t(lang, key), input: "FREE_TEXT", skippable: true };
    }
    case "CLOSE":
      return { key: "flow.close", text: t(lang, "flow.close"), input: "NONE", skippable: false };
    case "SCREENER": {
      const { item } = step;
      const prompt: Prompt = {
        key: item.promptKey,
        text: t(lang, item.promptKey),
        input: item.scale === "SCALE_0_3" ? "SCALE_0_3" : "YES_NO",
        skippable: true,
        screener: { instrument: item.instrument, itemCode: item.itemCode },
      };
      if (item.scale === "SCALE_0_3") {
        prompt.choices = ["0", "1", "2", "3"].map((v) => ({ value: v, label: t(lang, `flow.scale.${v}`) }));
      } else {
        prompt.choices = [
          { value: "1", label: t(lang, "common.yes") },
          { value: "0", label: t(lang, "common.no") },
        ];
      }
      const intro = introFor(item, lang);
      if (intro) prompt.intro = intro;
      return prompt;
    }
  }
}

function introFor(item: ScreenerItem, lang: VictimLang): string | null {
  if (item.itemCode === "SAFETY_SAFE_NOW") return t(lang, "flow.safety.intro");
  if (item.itemCode === "PHQ2_1") return `${t(lang, "flow.screenerIntro")} ${t(lang, "flow.scalePrompt")}`;
  if (item.instrument === "PHQ2" || item.instrument === "GAD2") return t(lang, "flow.scalePrompt");
  if (item.instrument === "PCPTSD5") return t(lang, "flow.pastMonthPrompt");
  return null;
}
