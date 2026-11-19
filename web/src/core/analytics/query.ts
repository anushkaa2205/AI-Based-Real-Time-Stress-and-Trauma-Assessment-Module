/**
 * Analytics reads (tasks 8.2–8.3, API_CONTRACTS §5.8, FR-DSH-06/07, NFR-PRI-05).
 * Reads ONLY `daily_stats` (anonymised roll-up). The caller's role pins the scope:
 * state admins to their state, district officers to their district.
 */
import mongoose from "mongoose";
import type { AnalyticsQuery } from "@/contracts/staff";
import type { StatRow } from "@/core/analytics/aggregate";
import { listScope, type PolicyUser } from "@/core/policies/rbac";
import { ForbiddenError } from "@/core/policies/serializers";
import { DailyStat, District, type RiskBand } from "@/models";
import { ensureRollupScheduled } from "./rollup";

const DAY_MS = 86_400_000;
export const DEFAULT_RANGE_DAYS = 30;
const ID = (v: unknown) => (v ? String(v) : null);
const mapToObj = (m: unknown): Record<string, number> =>
  m instanceof Map ? Object.fromEntries(m) : ((m as Record<string, number> | undefined) ?? {});

export interface ResolvedScope {
  stateId: string | null;
  districtId: string | null;
  from: Date;
  to: Date; // exclusive
}

/** Applies the role's scope over what was asked for; never widens it. */
export function resolveScope(user: PolicyUser, q: AnalyticsQuery, now: Date): ResolvedScope {
  const scope = listScope(user, "analytics.read");
  if (!scope) throw new ForbiddenError();
  let stateId = q.scope !== "national" ? (q.stateId ?? null) : null;
  let districtId = q.scope === "district" ? (q.districtId ?? null) : null;
  if (scope.kind === "state") {
    if (stateId && stateId !== scope.stateId) throw new ForbiddenError();
    stateId = scope.stateId;
  }
  if (scope.kind === "district") {
    if (districtId && districtId !== scope.districtId) throw new ForbiddenError();
    districtId = scope.districtId;
  }
  const to = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY_MS) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS);
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return { stateId, districtId, from, to };
}

export async function loadRows(user: PolicyUser, q: AnalyticsQuery, now = new Date()): Promise<{ rows: StatRow[]; scope: ResolvedScope }> {
  const scope = resolveScope(user, q, now);
  await ensureRollupScheduled(); // the roll-up keeps itself going; this only bootstraps it
  const filter: Record<string, unknown> = { day: { $gte: scope.from, $lt: scope.to } };
  if (scope.stateId) filter.stateId = new mongoose.Types.ObjectId(scope.stateId);
  if (scope.districtId) filter.districtId = new mongoose.Types.ObjectId(scope.districtId);
  if (q.channel) filter.channel = q.channel;
  if (q.language) filter.language = q.language;
  if (q.band) filter.band = q.band;
  if (q.portal === "exclude") filter.isPortal = { $ne: true }; // M.7; rows from before M.7 have no flag
  if (q.portal === "only") filter.isPortal = true;
  const docs = await DailyStat.find(filter).limit(50_000).lean();
  const rows: StatRow[] = docs.map((d) => ({
    day: new Date(d.day),
    districtId: ID(d.districtId),
    stateId: ID(d.stateId),
    channel: d.channel ?? null,
    language: d.language ?? null,
    band: (d.band ?? null) as RiskBand | null,
    interactions: d.interactions ?? 0,
    criticalAlerts: d.criticalAlerts ?? 0,
    medianAckSec: d.medianAckSec ?? null,
    ackCount: d.ackCount ?? 0,
    medianFirstResponseSec: d.medianFirstResponseSec ?? null,
    firstResponseCount: d.firstResponseCount ?? 0,
    referralsCreated: mapToObj(d.referralsCreated),
    referralsDone: mapToObj(d.referralsDone),
    slaBreaches: d.slaBreaches ?? 0,
    topDimensions: mapToObj(d.topDimensions),
  }));
  return { rows, scope };
}

export async function districtNames(ids: string[]): Promise<Map<string, string>> {
  const ds = await District.find({ _id: { $in: ids } }).select("name").lean();
  return new Map(ds.map((d) => [String(d._id), d.name]));
}
