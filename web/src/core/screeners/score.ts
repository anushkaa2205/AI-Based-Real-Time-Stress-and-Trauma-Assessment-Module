/**
 * Screener scoring and mapping to dimensions (task 2.2, FR-SCR-02/04, AC-SCR-02).
 * Pure. Skipped items count as unanswered.
 *
 * Asymmetric error policy (NFR-ETH-05): a "no" to a safety or suicide question
 * never produces a zero-score indicator, so it cannot dilute evidence from what
 * the person wrote. PHQ-2, GAD-2 and PC-PTSD-5 totals are used as they are.
 */
import type { CaseFact, IndicatorInput, OverrideFlag } from "@/core/scoring/types";
import { CUTOFFS, ITEM_BY_CODE, itemsOf, maxValue, type Instrument } from "./items";

export interface ScreenerResponseInput {
  instrument: Instrument;
  itemCode: string;
  value: number | null;
  skipped?: boolean;
}

export interface ScreenerScore {
  instrument: Instrument;
  total: number;
  maxTotal: number;
  isPositive: boolean;
  itemsAnswered: number;
}

/** Screeners are validated instruments: high confidence, scaled by how much was answered. */
const SCREENER_CONFIDENCE = 0.9;

/** Latest valid answer per item (people may change an answer). */
function answers(responses: readonly ScreenerResponseInput[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of responses) {
    const item = ITEM_BY_CODE.get(r.itemCode);
    if (!item || item.instrument !== r.instrument) continue;
    if (r.skipped || r.value === null || !Number.isInteger(r.value) || r.value < 0 || r.value > maxValue(item)) {
      out.delete(r.itemCode);
      continue;
    }
    out.set(r.itemCode, r.value);
  }
  return out;
}

export function scoreInstrument(instrument: Instrument, responses: readonly ScreenerResponseInput[]): ScreenerScore | null {
  const a = answers(responses);
  const items = itemsOf(instrument);
  const answered = items.filter((i) => a.has(i.itemCode));
  if (answered.length === 0) return null;
  const total = answered.reduce((s, i) => s + (a.get(i.itemCode) ?? 0), 0);
  const maxTotal = items.reduce((s, i) => s + maxValue(i), 0);
  const cutoff = CUTOFFS[instrument];
  return {
    instrument,
    total,
    maxTotal,
    isPositive: cutoff !== undefined ? total >= cutoff : total > 0,
    itemsAnswered: answered.length,
  };
}

export function scoreAll(responses: readonly ScreenerResponseInput[]): ScreenerScore[] {
  const instruments: Instrument[] = ["SAFETY_CHECK", "PHQ2", "GAD2", "PCPTSD5", "CSSRS_SCREEN"];
  return instruments.map((i) => scoreInstrument(i, responses)).filter((s): s is ScreenerScore => s !== null);
}

function ind(
  dimension: IndicatorInput["dimension"],
  score: number,
  confidence: number,
  label: string,
  itemCode: string,
  flags?: OverrideFlag[],
): IndicatorInput {
  return {
    id: `screener:${itemCode}`,
    dimension,
    source: "SCREENER",
    score,
    confidence,
    label,
    ...(flags?.length ? { flags } : {}),
  };
}

/** A "No" to a safety/suicide question: score 0, marked so it can never lower the band. */
function denial(dimension: IndicatorInput["dimension"], label: string, itemCode: string): IndicatorInput {
  return { ...ind(dimension, 0, SCREENER_CONFIDENCE, label, itemCode), denial: true };
}

/** Ratio indicator for summed instruments, scaled to the items answered. */
function ratio(instrument: Instrument, a: Map<string, number>) {
  const items = itemsOf(instrument);
  const answered = items.filter((i) => a.has(i.itemCode));
  if (!answered.length) return null;
  const total = answered.reduce((s, i) => s + (a.get(i.itemCode) ?? 0), 0);
  const max = answered.reduce((s, i) => s + maxValue(i), 0);
  return {
    score: total / max,
    confidence: SCREENER_CONFIDENCE * (answered.length / items.length),
    total,
    maxTotal: items.reduce((s, i) => s + maxValue(i), 0),
  };
}

export interface ScreenerSignals {
  indicators: IndicatorInput[];
  facts: CaseFact[];
}

export function screenerSignals(responses: readonly ScreenerResponseInput[]): ScreenerSignals {
  const a = answers(responses);
  const yes = (code: string) => a.get(code) === 1;
  const indicators: IndicatorInput[] = [];
  const facts: CaseFact[] = [];

  // Safety check (FR-SCR-01)
  if (a.get("SAFETY_SAFE_NOW") === 0) {
    facts.push("NOT_SAFE_NOW");
    indicators.push(ind("FEAR_ANXIETY", 0.8, SCREENER_CONFIDENCE, "Safety check: does not feel safe right now", "SAFETY_SAFE_NOW", ["NOT_SAFE_NOW"]));
  }
  if (yes("SAFETY_ACCUSED_NEARBY")) {
    indicators.push(
      ind("INTIMIDATION", 0.9, SCREENER_CONFIDENCE, "Safety check: the person who caused harm is nearby now", "SAFETY_ACCUSED_NEARBY", [
        "ACCUSED_PRESENT",
      ]),
    );
  }
  if (a.get("SAFETY_ACCUSED_NEARBY") === 0) indicators.push(denial("INTIMIDATION", "Safety check: says the accused is not nearby", "SAFETY_ACCUSED_NEARBY"));
  if (yes("SAFETY_SUICIDAL_INTENT")) {
    indicators.push(
      ind("SUICIDAL_IDEATION", 1, SCREENER_CONFIDENCE, "Safety check: thoughts of ending life, with intent", "SAFETY_SUICIDAL_INTENT", [
        "SUICIDAL_INTENT",
      ]),
    );
  } else if (yes("SAFETY_SUICIDAL_THOUGHTS")) {
    indicators.push(
      ind("SUICIDAL_IDEATION", 0.6, SCREENER_CONFIDENCE, "Safety check: thoughts of ending life", "SAFETY_SUICIDAL_THOUGHTS", [
        "PASSIVE_SUICIDAL_IDEATION",
      ]),
    );
  } else if (a.get("SAFETY_SUICIDAL_THOUGHTS") === 0) {
    indicators.push(denial("SUICIDAL_IDEATION", "Safety check: says no thoughts of ending life", "SAFETY_SUICIDAL_THOUGHTS"));
  }

  // PHQ-2 → depression, GAD-2 → fear/anxiety, PC-PTSD-5 → severe trauma
  const map: [Instrument, IndicatorInput["dimension"], string][] = [
    ["PHQ2", "DEPRESSION", "PHQ-2"],
    ["GAD2", "FEAR_ANXIETY", "GAD-2"],
    ["PCPTSD5", "SEVERE_TRAUMA", "PC-PTSD-5"],
  ];
  for (const [instrument, dimension, name] of map) {
    const r = ratio(instrument, a);
    if (r) indicators.push(ind(dimension, r.score, r.confidence, `${name} total ${r.total}/${r.maxTotal}`, instrument));
  }

  // C-SSRS screener → suicidal ideation (only "yes" answers produce a signal)
  const levels: [string, number, OverrideFlag][] = [
    ["CSSRS_6", 1, "SUICIDAL_INTENT"],
    ["CSSRS_5", 1, "SUICIDAL_INTENT"],
    ["CSSRS_4", 1, "SUICIDAL_INTENT"],
    ["CSSRS_3", 0.75, "PASSIVE_SUICIDAL_IDEATION"],
    ["CSSRS_2", 0.6, "PASSIVE_SUICIDAL_IDEATION"],
    ["CSSRS_1", 0.5, "PASSIVE_SUICIDAL_IDEATION"],
  ];
  const top = levels.find(([code]) => yes(code));
  const cssrsAnswered = levels.some(([code]) => a.has(code));
  if (!top && cssrsAnswered) indicators.push(denial("SUICIDAL_IDEATION", "Suicide-risk screen: \"no\" to the questions answered", "CSSRS"));
  if (top) {
    const [code, score, flag] = top;
    indicators.push(ind("SUICIDAL_IDEATION", score, SCREENER_CONFIDENCE, `Suicide-risk screen: "yes" to ${code}`, code, [flag]));
  }

  return { indicators, facts };
}
