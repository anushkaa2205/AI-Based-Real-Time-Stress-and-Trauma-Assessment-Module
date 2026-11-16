/**
 * Evaluation runner (tasks E.1/E.2 baseline and 4.10; the full pipeline runner is E.5).
 * Run from web/:
 *   npm run eval                 rules only (lexicon + context), like fallback mode
 *
 * Scenarios are conversations: only the person's turns are scored; operator questions are
 * context (FR-CH-02, task M.4). In AI mode the previous operator turn is not yet passed to the
 * model (gap V7, task M.9).
 *   npm run eval -- --mode=ai    adds the analysis service (needs it running; answers are cached)
 *
 * Same scoring code as the pipeline, without the database. Writes
 * evaluation/reports/<mode>.{md,json}. Text sent to the AI is redacted first.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "../web/scripts/load-env";
import { analyzeText, defaultDeps } from "@/core/analysis-client/client";
import { checkAnalysis } from "@/core/analysis-client/guardrails";
import { redact } from "@/core/privacy/redact";
import { evaluateRecommendations } from "@/core/recommendations/evaluate";
import { lexiconSignals } from "@/core/safety-lexicon/engine";
import { assess } from "@/core/scoring/assess";
import { contextSignals, type CaseContextInput } from "@/core/scoring/context";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import type { CaseFact, IndicatorInput } from "@/core/scoring/types";
import { ScenarioSchema, victimTexts, type Scenario } from "@/contracts/evaluation";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BANDS = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
const DETECT_THRESHOLD = 0.5;
const MODE = process.argv.includes("--mode=ai") ? "ai" : "rules";
const REPORT = MODE === "ai" ? "with-ai" : "rules-only-baseline";
let aiCalls = 0;
let aiDegraded = 0;
let aiDropped = 0;

function toContext(raw: Scenario["context"]): CaseContextInput {
  const ctx: Record<string, unknown> = { ...raw };
  if (raw.offenceCategory) ctx.isSexualOffence = raw.offenceCategory === "SEXUAL_VIOLENCE";
  if (raw.ageGroup) ctx.isMinor = raw.ageGroup === "UNDER_18";
  return ctx as CaseContextInput;
}

async function run(s: Scenario) {
  const t0 = performance.now();
  const indicators: IndicatorInput[] = [];
  const facts = new Set<CaseFact>();
  for (const m of victimTexts(s)) {
    const lx = lexiconSignals(m);
    indicators.push(...lx.indicators);
    lx.facts.forEach((f) => facts.add(f));
    if (MODE === "ai") {
      const redacted = redact(m).text;
      aiCalls++;
      const r = await analyzeText({ requestId: `eval-${s.id}`, text: redacted, languageHint: s.language }, { ...defaultDeps(), timeoutMs: 60_000 });
      if (r.degraded) aiDegraded++;
      else {
        const checked = checkAnalysis(r.result, m, redacted);
        aiDropped += checked.dropped;
        indicators.push(...checked.indicators);
      }
    }
  }
  const cx = contextSignals(toContext(s.context));
  indicators.push(...cx.indicators);
  cx.facts.forEach((f) => facts.add(f));

  const draft = assess({ indicators, config: DEFAULT_CONFIG, limitedConfidence: MODE !== "ai" });
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

async function main() {
  const dir = join(ROOT, "scenarios");
  const scenarios: Scenario[] = [];
  const errors: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = ScenarioSchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!parsed.success) errors.push(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    else if (parsed.data.id !== f.replace(".json", "")) errors.push(`${f}: id does not match file name`);
    else scenarios.push(parsed.data);
  }
  if (errors.length) {
    console.error(`Invalid scenarios:\n${errors.join("\n")}`);
    process.exit(1);
  }

  const results = [];
  for (const sc of scenarios) results.push(await run(sc));
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
  const siCases = results.filter((r) => r.expectedIndicators.includes("SUICIDAL_IDEATION"));
  const siRecall = pct(siCases.filter((r) => r.detected.includes("SUICIDAL_IDEATION") || r.overrides.some((o) => o === "OV-1" || o === "OV-6")).length, siCases.length);
  const dangerCases = results.filter((r) => r.expectedBand === "CRITICAL" && !r.expectedIndicators.includes("SUICIDAL_IDEATION"));
  const dangerRecall = pct(dangerCases.filter((r) => r.overrides.some((o) => ["OV-2", "OV-3"].includes(o))).length, dangerCases.length);

  const md = [
    MODE === "ai" ? "# Rules + AI (analysis service)" : "# Rules-only baseline (no AI)",
    "",
    `Scenarios: ${results.length} · scoring config v${DEFAULT_CONFIG.version} · labels are drafts until two team members agree (AC-EVAL-01).`,
    "",
    `- **Band accuracy:** ${correct}/${results.length} (${pct(correct, results.length)}) — target ≥ 80% (AC-RISK-01)`,
    `- **Critical scenarios placed below High:** ${criticalMissed.length}${criticalMissed.length ? ` (${criticalMissed.map((r) => r.id).join(", ")})` : ""} — target 0`,
    `- **Expected recommendations produced:** ${recHit}/${recExpected} (${pct(recHit, recExpected)}) — target ≥ 85% (AC-REC-01)`,
    `- **Slowest scenario:** ${maxMs.toFixed(1)} ms`,
    ...(MODE === "ai" ? [`- **AI calls:** ${aiCalls}, degraded: ${aiDegraded}, AI quotes dropped by guardrails: ${aiDropped}`] : []),
    `- **Suicidal-ideation recall:** ${siRecall} (AC-NLP-01 target 100%) · **immediate-danger recall:** ${dangerRecall} (AC-NLP-02 target 100%)`,
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
  writeFileSync(join(out, `${REPORT}.md`), md);
  writeFileSync(join(out, `${REPORT}.json`), JSON.stringify({ mode: MODE, configVersion: DEFAULT_CONFIG.version, results }, null, 2) + "\n");
  console.log(md.split("## Confusion")[0]);
  console.log(`Report: evaluation/reports/${REPORT}.md`);
}

void main();
