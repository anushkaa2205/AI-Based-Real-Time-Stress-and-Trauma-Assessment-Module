/**
 * Evaluation runner, rules-only mode (tasks E.1/E.2 baseline; full runner is E.5).
 * Run from web/:  npm run eval
 *
 * Scores every scenario with the deterministic path only (safety lexicon +
 * screeners + context → fuse → SVI → band → overrides → recommendations), with
 * no database and no AI, exactly like the pipeline's fallback mode. Writes
 * evaluation/reports/rules-only-baseline.{md,json}.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRecommendations } from "@/core/recommendations/evaluate";
import { lexiconSignals } from "@/core/safety-lexicon/engine";
import { assess } from "@/core/scoring/assess";
import { contextSignals, type CaseContextInput } from "@/core/scoring/context";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import type { CaseFact, IndicatorInput } from "@/core/scoring/types";
import { ITEM_BY_CODE } from "@/core/screeners/items";
import { screenerSignals } from "@/core/screeners/score";
import { ScenarioSchema, type Scenario } from "@/contracts/evaluation";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BANDS = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
const DETECT_THRESHOLD = 0.5;

function toContext(raw: Scenario["context"]): CaseContextInput {
  const ctx: Record<string, unknown> = { ...raw };
  if (raw.offenceCategory) ctx.isSexualOffence = raw.offenceCategory === "SEXUAL_VIOLENCE";
  if (raw.ageGroup) ctx.isMinor = raw.ageGroup === "UNDER_18";
  return ctx as CaseContextInput;
}

function run(s: Scenario) {
  const t0 = performance.now();
  const indicators: IndicatorInput[] = [];
  const facts = new Set<CaseFact>();
  for (const m of s.messages) {
    const lx = lexiconSignals(m);
    indicators.push(...lx.indicators);
    lx.facts.forEach((f) => facts.add(f));
  }
  const responses = s.screeners.map((r) => ({
    instrument: ITEM_BY_CODE.get(r.itemCode)!.instrument,
    itemCode: r.itemCode,
    value: r.value,
  }));
  const sc = screenerSignals(responses);
  const cx = contextSignals(toContext(s.context));
  indicators.push(...sc.indicators, ...cx.indicators);
  [...sc.facts, ...cx.facts].forEach((f) => facts.add(f));

  const draft = assess({ indicators, config: DEFAULT_CONFIG, limitedConfidence: true });
  const recs = evaluateRecommendations(
    { band: draft.band, overridesFired: draft.overridesFired, dimensions: draft.dimensions, facts: [...facts] },
    DEFAULT_CONFIG,
  );
  const detected = Object.entries(draft.dimensions)
    .filter(([, d]) => d.score >= DETECT_THRESHOLD)
    .map(([k]) => k);
  return {
    id: s.id,
    language: s.language,
    gender: s.gender,
    channel: s.channel,
    tags: s.tags,
    expectedBand: s.expected.band,
    band: draft.band,
    svi: draft.svi,
    overrides: draft.overridesFired,
    expectedIndicators: s.expected.indicators,
    detected,
    expectedRecs: s.expected.recommendations,
    recs: [...new Set(recs.map((r) => r.type))],
    ms: performance.now() - t0,
  };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");

function main() {
  const dir = join(ROOT, "scenarios");
  const scenarios: Scenario[] = [];
  const errors: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = ScenarioSchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!parsed.success) errors.push(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    else if (parsed.data.id !== f.replace(".json", "")) errors.push(`${f}: id does not match file name`);
    else {
      for (const r of parsed.data.screeners) if (!ITEM_BY_CODE.has(r.itemCode)) errors.push(`${f}: unknown item ${r.itemCode}`);
      scenarios.push(parsed.data);
    }
  }
  if (errors.length) {
    console.error(`Invalid scenarios:\n${errors.join("\n")}`);
    process.exit(1);
  }

  const results = scenarios.map(run);
  const correct = results.filter((r) => r.band === r.expectedBand).length;
  const criticalMissed = results.filter((r) => r.expectedBand === "CRITICAL" && (r.band === "LOW" || r.band === "MODERATE"));

  // Confusion matrix rows = expected, columns = predicted
  const matrix = BANDS.map((e) => BANDS.map((p) => results.filter((r) => r.expectedBand === e && r.band === p).length));

  // Per-dimension recall / precision
  const dims = [...new Set(results.flatMap((r) => [...r.expectedIndicators, ...r.detected]))].sort();
  const dimRows = dims.map((d) => {
    const tp = results.filter((r) => r.expectedIndicators.includes(d) && r.detected.includes(d)).length;
    const fn = results.filter((r) => r.expectedIndicators.includes(d) && !r.detected.includes(d)).length;
    const fp = results.filter((r) => !r.expectedIndicators.includes(d) && r.detected.includes(d)).length;
    return { d, tp, fn, fp, recall: pct(tp, tp + fn), precision: pct(tp, tp + fp) };
  });

  const recExpected = results.reduce((n, r) => n + r.expectedRecs.length, 0);
  const recHit = results.reduce((n, r) => n + r.expectedRecs.filter((x) => r.recs.includes(x)).length, 0);
  const groups = (key: "language" | "gender" | "channel") =>
    [...new Set(results.map((r) => r[key]))].sort().map((g) => {
      const rs = results.filter((r) => r[key] === g);
      return `| ${key}:${g} | ${rs.length} | ${pct(rs.filter((r) => r.band === r.expectedBand).length, rs.length)} |`;
    });
  const maxMs = Math.max(...results.map((r) => r.ms));

  const md = [
    "# Rules-only baseline (no AI)",
    "",
    `Scenarios: ${results.length} · scoring config v${DEFAULT_CONFIG.version} · labels are drafts until two team members agree (AC-EVAL-01).`,
    "",
    `- **Band accuracy:** ${correct}/${results.length} (${pct(correct, results.length)}) — target ≥ 80% (AC-RISK-01)`,
    `- **Critical scenarios placed below High:** ${criticalMissed.length}${criticalMissed.length ? ` (${criticalMissed.map((r) => r.id).join(", ")})` : ""} — target 0`,
    `- **Expected recommendations produced:** ${recHit}/${recExpected} (${pct(recHit, recExpected)}) — target ≥ 85% (AC-REC-01)`,
    `- **Slowest scenario:** ${maxMs.toFixed(1)} ms`,
    "",
    "## Confusion matrix (rows = expected, columns = rules-only result)",
    "",
    `| expected \\ got | ${BANDS.join(" | ")} |`,
    `|---|${BANDS.map(() => "---").join("|")}|`,
    ...BANDS.map((b, i) => `| ${b} | ${matrix[i]!.join(" | ")} |`),
    "",
    `## Indicators (detected = dimension score ≥ ${DETECT_THRESHOLD})`,
    "",
    "| Dimension | TP | FN | FP | Recall | Precision |",
    "|---|---|---|---|---|---|",
    ...dimRows.map((r) => `| ${r.d} | ${r.tp} | ${r.fn} | ${r.fp} | ${r.recall} | ${r.precision} |`),
    "",
    "## Band accuracy by group (fairness check, NFR-ETH-04)",
    "",
    "| Group | n | Band accuracy |",
    "|---|---|---|",
    ...groups("language"),
    ...groups("gender"),
    ...groups("channel"),
    "",
    "## Per scenario",
    "",
    "| ID | Lang | Expected | Got | SVI | Overrides | Missing recommendations |",
    "|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.language} | ${r.expectedBand} | ${r.band === r.expectedBand ? r.band : `**${r.band}**`} | ${r.svi} | ${r.overrides.join(", ") || "-"} | ${r.expectedRecs.filter((x) => !r.recs.includes(x)).join(", ") || "-"} |`,
    ),
    "",
  ].join("\n");

  const out = resolve(ROOT, "reports");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "rules-only-baseline.md"), md);
  writeFileSync(join(out, "rules-only-baseline.json"), JSON.stringify({ configVersion: DEFAULT_CONFIG.version, results }, null, 2) + "\n");
  console.log(md.split("## Confusion")[0]);
  console.log(`Report: evaluation/reports/rules-only-baseline.md`);
}

main();
