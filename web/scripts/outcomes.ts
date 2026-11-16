/**
 * `npm run eval:outcomes` (task 9.3, REQUIREMENTS Expected Outcomes EO-1…EO-5).
 *
 * EO-2: average wait of Critical cases when the queue is served in risk order (Critical → High →
 * Moderate → Low, then SVI, then arrival) versus first come, first served, on the same evaluation
 * scenarios: one arrival per minute in scenario order, one counsellor, a fixed handling time.
 * Bands are the rules-only results (the fallback the system always has), so this is a floor.
 * EO-5: alert-to-acknowledgement time and referrals by type and district come from the anonymised
 * daily_stats roll-up (synthetic test data here). Writes evaluation/reports/outcomes.json.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "./load-env";
import mongoose from "mongoose";
import { capacity, summarise, type StatRow } from "@/core/analytics/aggregate";
import { victimTexts } from "@/contracts/evaluation";
import { loadScenarios } from "@/core/admin/simulate";
import { lexiconSignals } from "@/core/safety-lexicon/engine";
import { assess } from "@/core/scoring/assess";
import { contextSignals, type CaseContextInput } from "@/core/scoring/context";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import type { IndicatorInput, RiskBand } from "@/core/scoring/types";
import { db } from "@/lib/db";
import { DailyStat } from "@/models";

const HANDLING_MIN = 8;
const toObj = (m: unknown): Record<string, number> => (m instanceof Map ? Object.fromEntries(m) : ((m as Record<string, number> | null | undefined) ?? {}));
const RANK: Record<RiskBand, number> = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };

interface Job {
  id: string;
  arrival: number;
  band: RiskBand;
  svi: number;
  expected: RiskBand;
}

/** Single-server queue; `pick` chooses the next case among those waiting. */
export function simulateQueue(jobs: Job[], pick: (waiting: Job[]) => Job): Map<string, number> {
  const waits = new Map<string, number>();
  const pending = [...jobs].sort((a, b) => a.arrival - b.arrival);
  const waiting: Job[] = [];
  let t = 0;
  while (pending.length || waiting.length) {
    while (pending.length && pending[0]!.arrival <= t) waiting.push(pending.shift()!);
    if (!waiting.length) {
      t = pending[0]!.arrival;
      continue;
    }
    const next = pick(waiting);
    waiting.splice(waiting.indexOf(next), 1);
    waits.set(next.id, t - next.arrival);
    t += HANDLING_MIN;
  }
  return waits;
}

function bandOf(s: ReturnType<typeof loadScenarios>[number]) {
  const indicators: IndicatorInput[] = [];
  for (const m of victimTexts(s)) indicators.push(...lexiconSignals(m).indicators);
  const ctx = { ...s.context } as Record<string, unknown>;
  if (s.context.offenceCategory) ctx.isSexualOffence = s.context.offenceCategory === "SEXUAL_VIOLENCE";
  if (s.context.ageGroup) ctx.isMinor = s.context.ageGroup === "UNDER_18";
  indicators.push(...contextSignals(ctx as CaseContextInput).indicators);
  return assess({ indicators, config: DEFAULT_CONFIG, limitedConfidence: true });
}

async function main() {
  const scenarios = loadScenarios();
  const jobs: Job[] = scenarios.map((s, i) => {
    const d = bandOf(s);
    return { id: s.id, arrival: i, band: d.band as RiskBand, svi: d.svi, expected: s.expected.band as RiskBand };
  });
  const fifo = simulateQueue(jobs, (w) => w.reduce((a, b) => (b.arrival < a.arrival ? b : a)));
  const risk = simulateQueue(jobs, (w) =>
    [...w].sort((a, b) => RANK[b.band] - RANK[a.band] || b.svi - a.svi || a.arrival - b.arrival)[0]!,
  );
  const avg = (m: Map<string, number>, ids: string[]) => Math.round((ids.reduce((s, id) => s + m.get(id)!, 0) / Math.max(1, ids.length)) * 10) / 10;
  const critical = jobs.filter((j) => j.expected === "CRITICAL").map((j) => j.id);
  const high = jobs.filter((j) => j.expected === "HIGH").map((j) => j.id);
  const all = jobs.map((j) => j.id);

  await db();
  const docs = await DailyStat.find().lean();
  const rows: StatRow[] = docs.map((d) => ({
    day: new Date(d.day),
    districtId: d.districtId ? String(d.districtId) : null,
    band: (d.band ?? null) as RiskBand | null,
    interactions: d.interactions ?? 0,
    criticalAlerts: d.criticalAlerts ?? 0,
    medianAckSec: d.medianAckSec ?? null,
    ackCount: d.ackCount ?? 0,
    medianFirstResponseSec: d.medianFirstResponseSec ?? null,
    firstResponseCount: d.firstResponseCount ?? 0,
    referralsCreated: toObj(d.referralsCreated),
    referralsDone: toObj(d.referralsDone),
    slaBreaches: d.slaBreaches ?? 0,
  }));
  const summary = summarise(rows);
  await mongoose.disconnect();

  const out = {
    measuredAt: new Date().toISOString(),
    queue: {
      model: `${jobs.length} evaluation scenarios, one arrival per minute, one counsellor, ${HANDLING_MIN} min per case, rules-only bands`,
      avgWaitMinCritical: { firstComeFirstServed: avg(fifo, critical), riskOrder: avg(risk, critical) },
      avgWaitMinHigh: { firstComeFirstServed: avg(fifo, high), riskOrder: avg(risk, high) },
      avgWaitMinAll: { firstComeFirstServed: avg(fifo, all), riskOrder: avg(risk, all) },
    },
    alerts: { criticalAlerts: summary.criticalAlerts, medianAckSec: summary.medianAckSec, medianFirstResponseSec: summary.medianFirstResponseSec, note: "synthetic test traffic in the shared dev database" },
    referralsByTypeAndDistrict: capacity(rows),
  };
  writeFileSync(resolve(__dirname, "../../evaluation/reports/outcomes.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out.queue, null, 2));
  console.log(`alerts: median ack ${JSON.stringify(summary.medianAckSec)}, first response ${JSON.stringify(summary.medianFirstResponseSec)}`);
}

main().catch((e) => {
  console.error(`outcomes failed: ${(e as Error).message}`);
  process.exit(1);
});
