/**
 * Simulate a scoring config against the evaluation set (task 8.6, FR-SVI-06, API_CONTRACTS §5.9).
 * Rules only (safety lexicon, screeners, context), the same code path as fallback mode, so it is
 * deterministic and needs no AI calls. Nothing is written. Synthetic scenarios only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ScenarioSchema, type Scenario } from "@/contracts/evaluation";
import { lexiconSignals } from "@/core/safety-lexicon/engine";
import { assess } from "@/core/scoring/assess";
import { contextSignals, type CaseContextInput } from "@/core/scoring/context";
import type { IndicatorInput, ScoringConfig } from "@/core/scoring/types";
import { ITEM_BY_CODE } from "@/core/screeners/items";
import { screenerSignals } from "@/core/screeners/score";

const BANDS = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
const DETECT = 0.5;

export interface Simulation {
  scenarios: number;
  bandAccuracy: number;
  /** expected suicidal-ideation scenarios where the dimension reached ≥ 0.5 */
  recallSuicidal: number | null;
  /** expected High/Critical scenarios predicted High or Critical (danger not missed) */
  recallDanger: number | null;
  /** rows = expected band, columns = predicted band (LOW, MODERATE, HIGH, CRITICAL) */
  confusionMatrix: number[][];
  mode: "rules-only";
}

function toContext(raw: Scenario["context"]): CaseContextInput {
  const ctx: Record<string, unknown> = { ...raw };
  if (raw.offenceCategory) ctx.isSexualOffence = raw.offenceCategory === "SEXUAL_VIOLENCE";
  if (raw.ageGroup) ctx.isMinor = raw.ageGroup === "UNDER_18";
  return ctx as CaseContextInput;
}

/** Pure: scenarios + config → metrics. */
export function simulate(scenarios: readonly Scenario[], config: ScoringConfig): Simulation {
  const rows = scenarios.map((s) => {
    const indicators: IndicatorInput[] = [];
    for (const m of s.messages) indicators.push(...lexiconSignals(m).indicators);
    const responses = s.screeners.map((r) => ({ instrument: ITEM_BY_CODE.get(r.itemCode)!.instrument, itemCode: r.itemCode, value: r.value }));
    indicators.push(...screenerSignals(responses).indicators, ...contextSignals(toContext(s.context)).indicators);
    const d = assess({ indicators, config, limitedConfidence: true });
    return { expected: s.expected, band: d.band, suicidal: (d.dimensions.SUICIDAL_IDEATION?.score ?? 0) >= DETECT };
  });
  const ratio = (n: number, of: number) => (of ? Math.round((1000 * n) / of) / 1000 : null);
  const suicidal = rows.filter((r) => r.expected.indicators.includes("SUICIDAL_IDEATION"));
  const danger = rows.filter((r) => r.expected.band === "HIGH" || r.expected.band === "CRITICAL");
  return {
    scenarios: rows.length,
    bandAccuracy: ratio(rows.filter((r) => r.band === r.expected.band).length, rows.length) ?? 0,
    recallSuicidal: ratio(suicidal.filter((r) => r.suicidal).length, suicidal.length),
    recallDanger: ratio(danger.filter((r) => r.band === "HIGH" || r.band === "CRITICAL").length, danger.length),
    confusionMatrix: BANDS.map((e) => BANDS.map((p) => rows.filter((r) => r.expected.band === e && r.band === p).length)),
    mode: "rules-only",
  };
}

/** The evaluation scenarios next to the web app (`../evaluation/scenarios`). */
export function loadScenarios(dir = resolve(process.cwd(), "../evaluation/scenarios")): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      const parsed = ScenarioSchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      return parsed.success && parsed.data.screeners.every((r) => ITEM_BY_CODE.has(r.itemCode)) ? [parsed.data] : [];
    });
}
