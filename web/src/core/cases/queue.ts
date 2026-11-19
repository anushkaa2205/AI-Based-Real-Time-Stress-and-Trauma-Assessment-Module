/**
 * Risk-sorted case queue (task 5.2, FR-CASE-01, AC-CASE-01, DATABASE §7.1).
 * Order: band ↓ (Critical first), SVI ↓, longest waiting first. Not arrival order.
 * District and state roles only ever load cases in their scope (§4).
 */
import type { z } from "zod";
import type { CaseQueueItem, CaseQueueQuery } from "@/contracts/staff";
import { decodeCursor, encodeCursor } from "@/contracts/staff";
import type { ListScope } from "@/core/policies/rbac";
import { serializeCaseQueueItem } from "@/core/policies/serializers";
import type { StaffUser } from "@/lib/staff-session";
import { Alert, Assessment, Case, District, Interaction } from "@/models";
import { BAND_RANK } from "@/models/enums";
import { userNames, userRef } from "./dto";

const ID = (v: unknown) => String(v);

/** Sort key used by the database query, exported for tests (AC-CASE-01). */
export const QUEUE_SORT = { bandRank: -1, currentSvi: -1, waitingSince: 1, _id: 1 } as const;

export async function caseQueue(user: StaffUser, scope: ListScope, q: z.output<typeof CaseQueueQuery>) {
  const filter: Record<string, unknown> = {};
  filter.status = q.status?.length ? { $in: q.status } : { $ne: "CLOSED" };
  if (q.band?.length) filter.bandRank = { $in: q.band.map((b) => BAND_RANK[b]) };
  if (scope.kind === "district") filter.districtId = scope.districtId;
  else if (scope.kind === "state") filter.stateId = scope.stateId;
  if (q.districtId && scope.kind !== "district") filter.districtId = q.districtId;
  if (q.assignedTo === "me") filter.assignedCounsellorId = user.id;
  else if (q.assignedTo === "unassigned") filter.assignedCounsellorId = null;
  else if (q.assignedTo) filter.assignedCounsellorId = q.assignedTo;
  // Dockets are stored in upper case: upper-casing the search keeps it case-insensitive and lets the
  // anchored prefix use the unique docketNumber index (a case-insensitive regex cannot).
  if (q.docket) filter.docketNumber = { $regex: `^${q.docket.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
  if (q.from || q.to) {
    filter.firstContactAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  }
  if (q.channel || q.language) {
    const iq: Record<string, unknown> = {};
    if (q.channel) iq.channel = q.channel;
    if (q.language) iq.uiLanguage = q.language;
    filter._id = { $in: await Interaction.distinct("caseId", iq) };
  }

  const offset = decodeCursor(q.cursor);
  const rows = await Case.find(filter)
    .sort(QUEUE_SORT)
    .skip(offset)
    .limit(q.limit + 1)
    .select("docketNumber currentBand currentSvi status assignedCounsellorId waitingSince limitedConfidence districtId latestAssessmentId isDemo")
    .lean();
  const page = rows.slice(0, q.limit);
  const ids = page.map((c) => c._id);

  const [latest, districts, names, alerts, assessments] = await Promise.all([
    Interaction.aggregate<{ _id: unknown; channel: string; language: string }>([
      { $match: { caseId: { $in: ids } } },
      { $sort: { startedAt: -1 } },
      { $group: { _id: "$caseId", channel: { $first: "$channel" }, language: { $first: "$uiLanguage" } } },
    ]),
    District.find({ _id: { $in: page.map((c) => c.districtId).filter(Boolean) } }).select("name").lean(),
    userNames(page.map((c) => c.assignedCounsellorId)),
    Alert.find({ caseId: { $in: ids }, status: "OPEN" }).select("caseId level escalationLevel").lean(),
    Assessment.find({ _id: { $in: page.map((c) => c.latestAssessmentId).filter(Boolean) } }).select("topEvidence explanation").lean(),
  ]);
  const byCase = new Map(latest.map((l) => [ID(l._id), l]));
  const districtName = new Map(districts.map((d) => [ID(d._id), d.name]));
  const reasonById = new Map(assessments.map((a) => [ID(a._id), a.topEvidence?.[0]?.label ?? a.explanation]));
  const alertByCase = new Map<string, (typeof alerts)[number]>();
  for (const a of alerts) {
    const prev = alertByCase.get(ID(a.caseId));
    if (!prev || (a.level === "CRITICAL" && prev.level !== "CRITICAL")) alertByCase.set(ID(a.caseId), a);
  }

  const items = page.map((c) => {
    const l = byCase.get(ID(c._id));
    const alert = alertByCase.get(ID(c._id));
    const item: CaseQueueItem = {
      id: ID(c._id),
      docketNumber: c.docketNumber,
      band: (c.currentBand ?? null) as CaseQueueItem["band"],
      svi: c.currentSvi ?? null,
      status: c.status as CaseQueueItem["status"],
      ...(l ? { channel: l.channel as CaseQueueItem["channel"], language: l.language as CaseQueueItem["language"] } : {}),
      district: c.districtId ? { id: ID(c.districtId), name: districtName.get(ID(c.districtId)) ?? "" } : null,
      assignedTo: userRef(c.assignedCounsellorId, names),
      waitingSince: new Date(c.waitingSince ?? Date.now()).toISOString(),
      ...(c.latestAssessmentId && reasonById.get(ID(c.latestAssessmentId)) ? { topReason: reasonById.get(ID(c.latestAssessmentId))! } : {}),
      limitedConfidence: c.limitedConfidence ?? false,
      openAlert: alert ? { id: ID(alert._id), level: alert.level as "CRITICAL" | "HIGH", escalationLevel: alert.escalationLevel ?? 0 } : null,
      isDemo: c.isDemo === true,
    };
    return serializeCaseQueueItem(user, item, { districtId: c.districtId ? ID(c.districtId) : null });
  });
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}
