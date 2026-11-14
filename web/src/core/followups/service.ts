/**
 * Follow-ups (task 6.7, FR-REC-09; the hook for SIH26094). Scheduled when a High or
 * Critical case is closed; the job runner reminds staff when one is due and marks it
 * MISSED a day later if nobody recorded an outcome.
 */
import mongoose from "mongoose";
import { decodeCursor, encodeCursor, type FollowUpItem } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { loadCaseResource } from "@/core/cases/resource";
import { userNames, userRef } from "@/core/cases/dto";
import { access, listScope, type PolicyUser } from "@/core/policies/rbac";
import { ForbiddenError } from "@/core/policies/serializers";
import { ApiError } from "@/lib/problem";
import { MISSED_AFTER_MS, endOfTodayIst } from "./schedule";
import { queueChannelsFor, type OutboundEvent } from "@/lib/realtime/channels";
import { Case, FollowUp, Job, User, type Channel } from "@/models";

const ID = (v: unknown) => String(v);
const iso = (d: unknown) => new Date(d as string | number | Date).toISOString();

type FollowUpLean = {
  _id: unknown;
  caseId: unknown;
  dueAt: Date;
  channel: string;
  status: string;
  assignedToId?: unknown;
  outcomeNote?: string | null;
};

async function toItems(rows: FollowUpLean[]): Promise<FollowUpItem[]> {
  const cases = await Case.find({ _id: { $in: rows.map((r) => r.caseId) } })
    .select("docketNumber")
    .lean();
  const dockets = new Map(cases.map((c) => [ID(c._id), c.docketNumber]));
  const names = await userNames(rows.map((r) => r.assignedToId));
  return rows.map((r) => ({
    id: ID(r._id),
    caseId: ID(r.caseId),
    docketNumber: dockets.get(ID(r.caseId)) ?? "",
    dueAt: iso(r.dueAt),
    channel: r.channel as FollowUpItem["channel"],
    status: r.status as FollowUpItem["status"],
    assignedTo: userRef(r.assignedToId, names),
    ...(r.outcomeNote ? { outcomeNote: r.outcomeNote } : {}),
  }));
}

export async function listFollowUps(
  user: PolicyUser,
  q: { status: string; due: "today" | "overdue" | "all"; caseId?: string; limit: number; cursor?: string },
  now = new Date(),
) {
  const scope = listScope(user, "followup.manage");
  if (!scope) throw new ForbiddenError();
  const filter: Record<string, unknown> = { status: q.status };
  if (q.due === "today") filter.dueAt = { $lt: endOfTodayIst(now) };
  if (q.due === "overdue") filter.dueAt = { $lt: now };
  if (scope.kind !== "all" || q.caseId) {
    const caseFilter: Record<string, unknown> = {};
    if (scope.kind === "district") caseFilter.districtId = new mongoose.Types.ObjectId(scope.districtId);
    if (scope.kind === "state") caseFilter.stateId = new mongoose.Types.ObjectId(scope.stateId);
    if (q.caseId) caseFilter._id = new mongoose.Types.ObjectId(q.caseId);
    filter.caseId = { $in: await Case.find(caseFilter).distinct("_id") };
  }
  const offset = decodeCursor(q.cursor);
  const rows = await FollowUp.find(filter).sort({ dueAt: 1, _id: 1 }).skip(offset).limit(q.limit + 1).lean();
  return { items: await toItems(rows.slice(0, q.limit)), nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

export async function createFollowUp(
  user: PolicyUser,
  caseId: string,
  body: { dueAt: string; channel: Channel; assignedToId?: string | null },
  now = new Date(),
): Promise<FollowUpItem> {
  const loaded = await loadCaseResource(caseId);
  if (!access(user, "followup.manage", loaded.resource)) throw new ForbiddenError();
  const dueAt = new Date(body.dueAt);
  if (dueAt.getTime() < now.getTime() - 60_000) throw new ApiError("VALIDATION_FAILED", "The follow-up must be in the future");
  // Default: the assigned counsellor, else whoever schedules it.
  const assignedToId = body.assignedToId ?? (loaded.caseDoc.assignedCounsellorId ? ID(loaded.caseDoc.assignedCounsellorId) : user.id);
  if (body.assignedToId) {
    const ok = await User.exists({ _id: body.assignedToId, isActive: true, role: { $in: ["COUNSELLOR", "NHAA_SUPERVISOR", "DISTRICT_OFFICER"] } });
    if (!ok) throw new ApiError("VALIDATION_FAILED", "Assign the follow-up to an active counsellor, supervisor or district officer");
  }
  const doc = await FollowUp.create({ caseId: loaded.caseDoc._id, dueAt, channel: body.channel, assignedToId, status: "SCHEDULED" });
  await Promise.all([
    Job.create({ type: "followup.remind", payload: { followUpId: ID(doc._id), stage: "due" }, runAt: dueAt }),
    record({
      actorType: "USER",
      actorId: user.id,
      action: "followup.create",
      entityType: "case",
      entityId: ID(loaded.caseDoc._id),
      metadata: { followUpId: ID(doc._id), channel: body.channel },
    }),
  ]);
  return (await toItems([doc.toObject() as FollowUpLean]))[0]!;
}

export async function updateFollowUp(user: PolicyUser, id: string, body: { status: "DONE" | "MISSED" | "CANCELLED"; outcomeNote?: string }) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const fu = await FollowUp.findById(id).lean();
  if (!fu) throw new ApiError("NOT_FOUND");
  const loaded = await loadCaseResource(ID(fu.caseId));
  if (!access(user, "followup.manage", loaded.resource)) throw new ForbiddenError();
  const updated = await FollowUp.findOneAndUpdate(
    { _id: fu._id, status: "SCHEDULED" },
    { $set: { status: body.status, ...(body.outcomeNote ? { outcomeNote: body.outcomeNote } : {}) } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new ApiError("INVALID_TRANSITION", "Only a scheduled follow-up can be updated");
  await Promise.all([
    Job.updateMany({ type: "followup.remind", "payload.followUpId": id, doneAt: null }, { $set: { doneAt: new Date() } }),
    record({ actorType: "USER", actorId: user.id, action: "followup.update", entityType: "case", entityId: ID(fu.caseId), metadata: { followUpId: id, status: body.status } }),
  ]);
  return (await toItems([updated as FollowUpLean]))[0]!;
}

/** Job handler: remind when due, then mark MISSED a day later if still open. */
export async function remindFollowUp(
  payload: { followUpId?: string; stage?: "due" | "miss" },
  now: Date,
): Promise<{ done: true; events?: OutboundEvent[] }> {
  if (!payload.followUpId) return { done: true };
  const fu = await FollowUp.findById(payload.followUpId).lean();
  if (!fu || fu.status !== "SCHEDULED") return { done: true };
  const c = await Case.findById(fu.caseId).select("docketNumber districtId").lean();
  if (!c) return { done: true };
  // A reminder that ran very late (no staff screen open for a day) goes straight to MISSED.
  if (payload.stage === "miss" || now.getTime() >= fu.dueAt.getTime() + MISSED_AFTER_MS) {
    await FollowUp.updateOne({ _id: fu._id, status: "SCHEDULED" }, { $set: { status: "MISSED" } });
    await record({ actorType: "SYSTEM", actorId: "jobs", action: "followup.missed", entityType: "case", entityId: ID(c._id), metadata: { followUpId: ID(fu._id) } });
    return { done: true };
  }
  await Job.create({ type: "followup.remind", payload: { followUpId: ID(fu._id), stage: "miss" }, runAt: new Date(fu.dueAt.getTime() + MISSED_AFTER_MS) });
  const data = { followUpId: ID(fu._id), caseId: ID(c._id), docketNumber: c.docketNumber, dueAt: iso(fu.dueAt) };
  return {
    done: true,
    events: queueChannelsFor(c.districtId ? ID(c.districtId) : null).map((channel) => ({ channel, event: "followup.due" as const, data })),
  };
}
