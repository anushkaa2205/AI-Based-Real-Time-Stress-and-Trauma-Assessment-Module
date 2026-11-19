/**
 * `stats.rollup` (task 8.2, DATABASE §7, FR-DSH-06, NFR-PRI-05).
 *
 * Recomputes the anonymised `daily_stats` rows for one day from interactions, assessments,
 * alerts, referrals and the audit trail. Analytics endpoints read only `daily_stats`, never
 * case collections. Each run replaces that day's rows, so re-running is safe.
 * Rows carry counts and medians only: no ids of cases, people or staff.
 *
 * Group key: day × district × channel × language × band (the highest band the interaction reached).
 * Referrals and SLA breaches are attributed to the group of the case's latest interaction that day.
 * (DATABASE.md describes a single `$merge` aggregation; computing in code gives the same rows
 * and is easier to test at our current volumes. Logged for the docs.)
 */
import mongoose from "mongoose";
import { median } from "@/core/analytics/aggregate";
import { Alert, Assessment, AuditLog, BAND_RANK, Case, DailyStat, Interaction, Job, Referral, type RiskBand } from "@/models";

const ID = (v: unknown) => (v ? String(v) : "");
const DAY_MS = 86_400_000;
/** The job re-runs hourly (today and yesterday, so late events still count). */
export const ROLLUP_EVERY_MS = 3_600_000;

export function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface Group {
  key: string;
  districtId: string | null;
  stateId: string | null;
  channel: string;
  language: string;
  band: RiskBand | null;
  isPortal: boolean;
  interactions: number;
  criticalAlerts: number;
  ackSecs: number[];
  firstResponseSecs: number[];
  referralsCreated: Record<string, number>;
  referralsDone: Record<string, number>;
  slaBreaches: number;
  topDimensions: Record<string, number>;
}

/** Group key: day × district × channel × language × band × portal (task M.7). */
function groupKey(districtId: string, channel: string, language: string, band: RiskBand | null, isPortal: boolean): string {
  return [districtId, channel, language, band ?? "", isPortal ? "portal" : ""].join("|");
}

export async function rollupDay(day: Date, now: Date = new Date()): Promise<{ rows: number; interactions: number }> {
  const from = dayStart(day);
  const to = new Date(from.getTime() + DAY_MS);

  const interactions = await Interaction.find({ startedAt: { $gte: from, $lt: to } })
    .select("caseId channel uiLanguage startedAt isPortal")
    .lean();
  const caseIds = [...new Set(interactions.map((i) => ID(i.caseId)))];
  const iids = interactions.map((i) => i._id);

  const [cases, assessments, alerts, referrals, firstActions] = await Promise.all([
    Case.find({ _id: { $in: caseIds } }).select("districtId stateId").lean(),
    Assessment.find({ interactionId: { $in: iids } })
      .select("interactionId band seq topEvidence")
      .lean(),
    Alert.find({ interactionId: { $in: iids }, level: "CRITICAL" })
      .select("interactionId createdAt acknowledgedAt")
      .lean(),
    Referral.find({ createdAt: { $gte: from, $lt: to } })
      .select("caseId type status dueAt history createdAt")
      .lean(),
    // First staff action on each case (case opened, alert acknowledged, note…), for time to first response.
    AuditLog.aggregate<{ _id: string; first: Date }>([
      { $match: { actorType: "USER", entityType: "case", entityId: { $in: caseIds } } },
      { $group: { _id: "$entityId", first: { $min: "$createdAt" } } },
    ]),
  ]);

  const caseById = new Map(cases.map((c) => [ID(c._id), c]));
  const firstAction = new Map(firstActions.map((a) => [a._id, new Date(a.first)]));

  // Highest band per interaction, and the dimensions in its latest assessment's top evidence.
  const bandOf = new Map<string, RiskBand>();
  const latest = new Map<string, { seq: number; dims: string[] }>();
  for (const a of assessments) {
    const k = ID(a.interactionId);
    const band = a.band as RiskBand;
    const prev = bandOf.get(k);
    if (!prev || BAND_RANK[band] > BAND_RANK[prev]) bandOf.set(k, band);
    const cur = latest.get(k);
    if (!cur || a.seq > cur.seq) latest.set(k, { seq: a.seq, dims: (a.topEvidence ?? []).map((e) => String(e.dimension ?? "")).filter(Boolean) });
  }

  const groups = new Map<string, Group>();
  const groupOfCase = new Map<string, Group>();
  const sorted = [...interactions].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  for (const i of sorted) {
    const c = caseById.get(ID(i.caseId));
    const band = bandOf.get(ID(i._id)) ?? null;
    const key = groupKey(ID(c?.districtId), i.channel, i.uiLanguage, band, i.isPortal === true);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        districtId: c?.districtId ? ID(c.districtId) : null,
        stateId: c?.stateId ? ID(c.stateId) : null,
        channel: i.channel,
        language: i.uiLanguage,
        band,
        isPortal: i.isPortal === true, // M.7
        interactions: 0,
        criticalAlerts: 0,
        ackSecs: [],
        firstResponseSecs: [],
        referralsCreated: {},
        referralsDone: {},
        slaBreaches: 0,
        topDimensions: {},
      };
      groups.set(key, g);
    }
    g.interactions += 1;
    for (const d of latest.get(ID(i._id))?.dims ?? []) g.topDimensions[d] = (g.topDimensions[d] ?? 0) + 1;
    const first = firstAction.get(ID(i.caseId));
    const started = new Date(i.startedAt).getTime();
    if (first && first.getTime() >= started && !groupOfCase.has(ID(i.caseId))) g.firstResponseSecs.push(Math.round((first.getTime() - started) / 1000));
    groupOfCase.set(ID(i.caseId), g); // latest interaction of the day wins for referrals
  }

  const groupOfInteraction = new Map<string, Group>();
  for (const i of interactions) {
    const c = caseById.get(ID(i.caseId));
    groupOfInteraction.set(ID(i._id), groups.get(groupKey(ID(c?.districtId), i.channel, i.uiLanguage, bandOf.get(ID(i._id)) ?? null, i.isPortal === true))!);
  }
  for (const a of alerts) {
    const g = groupOfInteraction.get(ID(a.interactionId));
    if (!g) continue;
    g.criticalAlerts += 1;
    if (a.acknowledgedAt) g.ackSecs.push(Math.round((new Date(a.acknowledgedAt).getTime() - new Date(a.createdAt).getTime()) / 1000));
  }
  for (const r of referrals) {
    const g = groupOfCase.get(ID(r.caseId));
    if (!g) continue; // case first contacted on another day: counted with that day's groups only if re-run
    g.referralsCreated[r.type] = (g.referralsCreated[r.type] ?? 0) + 1;
    const doneAt = r.status === "DONE" ? (r.history ?? []).filter((h) => h.status === "DONE").map((h) => new Date(h.at as Date).getTime())[0] : undefined;
    if (r.status === "DONE") g.referralsDone[r.type] = (g.referralsDone[r.type] ?? 0) + 1;
    const due = r.dueAt ? new Date(r.dueAt).getTime() : null;
    const open = ["PENDING", "ACCEPTED", "IN_PROGRESS"].includes(r.status);
    if (due !== null && ((open && due < now.getTime()) || (doneAt !== undefined && doneAt > due))) g.slaBreaches += 1;
  }

  const docs = [...groups.values()].map((g) => ({
    day: from,
    stateId: g.stateId ? new mongoose.Types.ObjectId(g.stateId) : null,
    districtId: g.districtId ? new mongoose.Types.ObjectId(g.districtId) : null,
    channel: g.channel,
    language: g.language,
    band: g.band,
    isPortal: g.isPortal,
    interactions: g.interactions,
    criticalAlerts: g.criticalAlerts,
    medianAckSec: median(g.ackSecs),
    ackCount: g.ackSecs.length,
    medianFirstResponseSec: median(g.firstResponseSecs),
    firstResponseCount: g.firstResponseSecs.length,
    referralsCreated: g.referralsCreated,
    referralsDone: g.referralsDone,
    slaBreaches: g.slaBreaches,
    topDimensions: g.topDimensions,
  }));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await DailyStat.deleteMany({ day: from }, { session });
      if (docs.length) await DailyStat.insertMany(docs, { session });
    });
  } finally {
    await session.endSession();
  }
  return { rows: docs.length, interactions: interactions.length };
}

/** Job handler: today and yesterday, then schedule the next run. */
export async function runRollup(now: Date): Promise<void> {
  await rollupDay(new Date(now.getTime() - DAY_MS), now);
  await rollupDay(now, now);
  // The running job is still pending until the runner marks it done, so create the next one directly.
  await Job.create({ type: "stats.rollup", payload: {}, runAt: new Date(now.getTime() + ROLLUP_EVERY_MS) });
}

/** Keeps exactly one pending roll-up job (called by analytics reads and after each run). */
export async function ensureRollupScheduled(runAt: Date = new Date()): Promise<void> {
  await Job.updateOne({ type: "stats.rollup", doneAt: null }, { $setOnInsert: { type: "stats.rollup", payload: {}, runAt, attempts: 0 } }, { upsert: true });
}
