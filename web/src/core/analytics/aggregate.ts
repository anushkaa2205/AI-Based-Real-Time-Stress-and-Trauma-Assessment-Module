/**
 * Analytics arithmetic (task 8.2, FR-DSH-06, NFR-PRI-05, AC-DSH-02). Pure: no database, no clock.
 *
 * Analytics read only the anonymised `daily_stats` roll-up. Any group whose count is below
 * SUPPRESS_BELOW is returned as null with `suppressed: true`, so small groups cannot be
 * re-identified. Suppression is applied to the final numbers the caller sees.
 */
import type { RiskBand } from "@/models/enums";

export const SUPPRESS_BELOW = 5;

/** One daily_stats row (one day × district × channel × language × band). */
export interface StatRow {
  day: Date;
  districtId?: string | null;
  stateId?: string | null;
  channel?: string | null;
  language?: string | null;
  band?: RiskBand | null;
  interactions: number;
  criticalAlerts: number;
  /** median seconds to acknowledge Critical alerts in this group, with how many alerts it covers */
  medianAckSec?: number | null;
  ackCount?: number;
  medianFirstResponseSec?: number | null;
  firstResponseCount?: number;
  referralsCreated?: Record<string, number>;
  referralsDone?: Record<string, number>;
  slaBreaches?: number;
  /** dimension → number of interactions where it was among the top evidence */
  topDimensions?: Record<string, number>;
}

export type Suppressed<T> = { value: T; suppressed: false } | { value: null; suppressed: true };

/** Count below 5 (and above 0) → hidden. Zero is not identifying and is shown. */
export function suppressCount(n: number): Suppressed<number> {
  return n > 0 && n < SUPPRESS_BELOW ? { value: null, suppressed: true } : { value: n, suppressed: false };
}

/**
 * Median across groups from each group's median, weighted by how many values it covers.
 * An approximation of the true median (documented); exact when there is one group.
 */
export function weightedMedian(parts: { median: number | null | undefined; n: number | undefined }[]): number | null {
  const xs = parts.filter((p) => p.median != null && (p.n ?? 0) > 0).sort((a, b) => a.median! - b.median!);
  const total = xs.reduce((s, p) => s + (p.n ?? 0), 0);
  if (!total) return null;
  let acc = 0;
  for (const p of xs) {
    acc += p.n ?? 0;
    if (acc >= total / 2) return p.median!;
  }
  return xs.at(-1)!.median!;
}

/** Exact median of raw values (used by the roll-up job per group). */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

const sumMap = (rows: StatRow[], key: "referralsCreated" | "referralsDone" | "topDimensions") => {
  const out: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r[key] ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
};
const total = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + v, 0);

export interface Summary {
  interactions: Suppressed<number>;
  byBand: Record<RiskBand, Suppressed<number>>;
  criticalAlerts: Suppressed<number>;
  medianAckSec: Suppressed<number | null>;
  medianFirstResponseSec: Suppressed<number | null>;
  referralsCreated: Suppressed<number>;
  referralsDone: Suppressed<number>;
  slaBreaches: Suppressed<number>;
}

/**
 * Secondary (complementary) suppression: if exactly one band is hidden, it could be worked out
 * as total − the other bands. Then also hide the smallest other non-zero band, or the total
 * when there is none, so no hidden cell can be recovered by subtraction.
 */
function protectBands(total: Suppressed<number>, bands: Record<RiskBand, Suppressed<number>>): Suppressed<number> {
  const hidden = (Object.keys(bands) as RiskBand[]).filter((b) => bands[b].suppressed);
  if (hidden.length !== 1 || total.suppressed) return total;
  const others = (Object.keys(bands) as RiskBand[])
    .filter((b) => !bands[b].suppressed && (bands[b].value ?? 0) > 0)
    .sort((a, b) => (bands[a].value ?? 0) - (bands[b].value ?? 0));
  if (others.length) bands[others[0]!] = { value: null, suppressed: true };
  else return { value: null, suppressed: true };
  return total;
}

/** §5.8 summary over any set of rows, with small counts suppressed. */
export function summarise(rows: StatRow[]): Summary {
  const n = rows.reduce((s, r) => s + r.interactions, 0);
  const byBand = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 } as Record<RiskBand, number>;
  for (const r of rows) if (r.band) byBand[r.band] += r.interactions;
  const ackN = rows.reduce((s, r) => s + (r.ackCount ?? 0), 0);
  const frN = rows.reduce((s, r) => s + (r.firstResponseCount ?? 0), 0);
  // A median over fewer than 5 values describes individual people: suppress it too.
  const med = (value: number | null, count: number): Suppressed<number | null> =>
    count > 0 && count < SUPPRESS_BELOW ? { value: null, suppressed: true } : { value, suppressed: false };
  const bands: Record<RiskBand, Suppressed<number>> = {
    LOW: suppressCount(byBand.LOW),
    MODERATE: suppressCount(byBand.MODERATE),
    HIGH: suppressCount(byBand.HIGH),
    CRITICAL: suppressCount(byBand.CRITICAL),
  };
  const interactions = protectBands(suppressCount(n), bands);
  return {
    interactions,
    byBand: bands,
    criticalAlerts: suppressCount(rows.reduce((s, r) => s + r.criticalAlerts, 0)),
    medianAckSec: med(weightedMedian(rows.map((r) => ({ median: r.medianAckSec, n: r.ackCount }))), ackN),
    medianFirstResponseSec: med(weightedMedian(rows.map((r) => ({ median: r.medianFirstResponseSec, n: r.firstResponseCount }))), frN),
    referralsCreated: suppressCount(total(sumMap(rows, "referralsCreated"))),
    referralsDone: suppressCount(total(sumMap(rows, "referralsDone"))),
    slaBreaches: suppressCount(rows.reduce((s, r) => s + (r.slaBreaches ?? 0), 0)),
  };
}

/** Heat map: High and Critical per 1000 interactions per district; small districts suppressed. */
export function heatmap(rows: StatRow[], names: ReadonlyMap<string, string>) {
  const byDistrict = new Map<string, StatRow[]>();
  for (const r of rows) {
    if (!r.districtId) continue;
    const list = byDistrict.get(r.districtId) ?? [];
    list.push(r);
    byDistrict.set(r.districtId, list);
  }
  return [...byDistrict.entries()].map(([districtId, rs]) => {
    const count = rs.reduce((s, r) => s + r.interactions, 0);
    const of = (band: RiskBand) => rs.filter((r) => r.band === band).reduce((s, r) => s + r.interactions, 0);
    const suppressed = count > 0 && count < SUPPRESS_BELOW;
    const per1000 = (x: number) => (suppressed || !count ? null : Math.round((1000 * x) / count));
    return {
      districtId,
      districtName: names.get(districtId) ?? "Unknown",
      criticalPer1000: per1000(of("CRITICAL")),
      highPer1000: per1000(of("HIGH")),
      count: suppressed ? null : count,
      suppressed,
    };
  });
}

/** ISO week start (Monday, UTC) or the day itself. */
export function periodOf(day: Date, interval: "day" | "week"): string {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  if (interval === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Trends: bands per period and the dimensions most often among the top evidence. */
export function trends(rows: StatRow[], interval: "day" | "week") {
  const byPeriod = new Map<string, StatRow[]>();
  for (const r of rows) {
    const p = periodOf(r.day, interval);
    byPeriod.set(p, [...(byPeriod.get(p) ?? []), r]);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, rs]) => {
      const dims = sumMap(rs, "topDimensions");
      const dimTotal = total(dims);
      return {
        period,
        byBand: summarise(rs).byBand,
        topDimensions:
          dimTotal < SUPPRESS_BELOW
            ? []
            : Object.entries(dims)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([dimension, n]) => ({ dimension, share: Math.round((100 * n) / dimTotal) / 100 })),
      };
    });
}

/** Demand vs capacity: referrals created vs done by district and support type. */
export function capacity(rows: StatRow[]) {
  const key = (d: string, t: string) => `${d}|${t}`;
  const acc = new Map<string, { districtId: string; supportType: string; demand: number; completed: number }>();
  for (const r of rows) {
    if (!r.districtId) continue;
    for (const [t, n] of Object.entries(r.referralsCreated ?? {})) {
      const e = acc.get(key(r.districtId, t)) ?? { districtId: r.districtId, supportType: t, demand: 0, completed: 0 };
      e.demand += n;
      acc.set(key(r.districtId, t), e);
    }
    for (const [t, n] of Object.entries(r.referralsDone ?? {})) {
      const e = acc.get(key(r.districtId, t)) ?? { districtId: r.districtId, supportType: t, demand: 0, completed: 0 };
      e.completed += n;
      acc.set(key(r.districtId, t), e);
    }
  }
  return [...acc.values()].map((e) => {
    const demand = suppressCount(e.demand);
    const completed = suppressCount(e.completed);
    return { districtId: e.districtId, supportType: e.supportType, demand: demand.value, completed: completed.value, suppressed: demand.suppressed || completed.suppressed };
  });
}
