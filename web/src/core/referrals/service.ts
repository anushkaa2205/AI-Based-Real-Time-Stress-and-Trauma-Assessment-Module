/**
 * Approval inbox, decisions and referrals (tasks 6.1, 6.3; FR-REC-05/07/08, AC-REC-03/05).
 *
 * Only a human decision turns a proposal into a referral. A referral is the ONLY
 * thing police and welfare roles ever receive: docket, type, action, location hint,
 * contact route, urgency, status (C-ETH-02, CLAUDE.md rule 8).
 */
import mongoose, { type Types } from "mongoose";
import {
  encodeCursor,
  decodeCursor,
  type DecisionRequest,
  type RecommendationInboxItem,
  type ReferralDto,
  type ReferralPatch,
} from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { recommendationDto, userNames } from "@/core/cases/dto";
import { access, listScope, type PolicyResource, type PolicyUser } from "@/core/policies/rbac";
import { ForbiddenError, serializeReferral } from "@/core/policies/serializers";
import { ApiError } from "@/lib/problem";
import { roleChannel, type OutboundEvent } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { Case, District, Recommendation, Referral, User, type ReferralStatus, type Role, type SupportType } from "@/models";
import { checkDecision, checkReferralText, checkReferralTransition, contactRoute, referralDueAt, type RecommendationStatus } from "./rules";

const ID = (v: unknown) => String(v);
const iso = (d: unknown) => new Date(d as string | number | Date).toISOString();
const isId = (v: string) => /^[a-f0-9]{24}$/.test(v);

/** District officers decide police and protection proposals only (§4 matrix). */
const DISTRICT_DECIDE_TYPES: readonly SupportType[] = ["POLICE_INTERVENTION", "WITNESS_PROTECTION"];

// --- referral → DTO ----------------------------------------------------------

interface ReferralDocLike {
  _id: unknown;
  docketNumber: string;
  type: string;
  targetRole: string;
  districtId?: unknown;
  actionRequested: string;
  locationHint?: string | null;
  contactRoute: string;
  urgency: string;
  dueAt?: Date | null;
  status: string;
  outcomeNote?: string | null;
  createdAt?: unknown;
}

export function referralResource(r: { targetRole: string; districtId?: unknown }): PolicyResource {
  return { districtId: r.districtId ? ID(r.districtId) : null, referralTargetRole: r.targetRole as Role };
}

function referralDto(r: ReferralDocLike): ReferralDto {
  return {
    id: ID(r._id),
    docketNumber: r.docketNumber,
    type: r.type as ReferralDto["type"],
    actionRequested: r.actionRequested,
    ...(r.locationHint ? { locationHint: r.locationHint } : {}),
    contactRoute: r.contactRoute,
    urgency: r.urgency as ReferralDto["urgency"],
    ...(r.dueAt ? { dueAt: iso(r.dueAt) } : {}),
    status: r.status as ReferralDto["status"],
    ...(r.outcomeNote ? { outcomeNote: r.outcomeNote } : {}),
    createdAt: iso(r.createdAt ?? Date.now()),
  };
}

/** Role-shaped referral. Throws 403 when the user may not see it. */
export function shapeReferral(user: PolicyUser, r: ReferralDocLike): ReferralDto {
  return serializeReferral(user, referralDto(r), referralResource(r));
}

/** Real-time events for a referral: only the target role in its district (§7). */
function referralEvents(event: "referral.created" | "referral.updated", r: ReferralDocLike): OutboundEvent[] {
  if (!r.districtId) return [];
  const data = referralDto(r); // already minimal; same fields every role in that channel may see
  const roles = new Set<Role>([r.targetRole as Role, "DISTRICT_OFFICER"]);
  return [...roles].map((role) => ({ channel: roleChannel(role, ID(r.districtId)), event, data }));
}

// --- approval inbox (GET /recommendations) ----------------------------------------------

export async function recommendationInbox(
  user: PolicyUser,
  q: { status: RecommendationStatus; responsibleRole?: Role; districtId?: string; needsReview?: "true" | "false"; limit: number; cursor?: string },
): Promise<{ items: RecommendationInboxItem[]; nextCursor: string | null }> {
  const scope = listScope(user, "recommendation.decide");
  if (!scope) throw new ForbiddenError();

  const filter: Record<string, unknown> = { status: q.status };
  if (q.responsibleRole) filter.responsibleRole = q.responsibleRole;
  if (q.needsReview === "true") Object.assign(filter, { status: "AUTO_TRIGGERED", type: "EMERGENCY_SUPPORT", postReviewedAt: null });

  let districtId = q.districtId;
  if (scope.kind === "district") {
    if (districtId && districtId !== scope.districtId) throw new ForbiddenError();
    districtId = scope.districtId;
    filter.type = { $in: DISTRICT_DECIDE_TYPES };
  }
  if (districtId) {
    const caseIds = await Case.find({ districtId }).distinct("_id");
    filter.caseId = { $in: caseIds };
  }

  const offset = decodeCursor(q.cursor);
  const rows = await Recommendation.find(filter)
    .sort({ dueAt: 1, createdAt: 1, _id: 1 })
    .skip(offset)
    .limit(q.limit + 1)
    .lean();
  const page = rows.slice(0, q.limit);
  const cases = await Case.find({ _id: { $in: page.map((r) => r.caseId) } })
    .select("docketNumber currentBand districtId")
    .lean();
  const byCase = new Map(cases.map((c) => [ID(c._id), c]));
  const names = await userNames(page.map((r) => r.decision?.byUserId));

  const items = page.flatMap((r) => {
    const c = byCase.get(ID(r.caseId));
    if (!c) return [];
    const resource: PolicyResource = { districtId: c.districtId ? ID(c.districtId) : null, recommendationType: r.type as SupportType };
    if (!access(user, "recommendation.decide", resource)) return [];
    return [
      {
        ...recommendationDto(r, names),
        caseId: ID(r.caseId),
        docketNumber: c.docketNumber,
        band: (c.currentBand ?? null) as RecommendationInboxItem["band"],
        postReviewedAt: r.postReviewedAt ? iso(r.postReviewedAt) : null,
      },
    ];
  });
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

// --- decision (POST /recommendations/{id}/decision) --------------------------------------

export async function decideRecommendation(user: PolicyUser & { name: string }, id: string, body: DecisionRequest) {
  if (!isId(id)) throw new ApiError("NOT_FOUND");
  const rec = await Recommendation.findById(id).lean();
  if (!rec) throw new ApiError("NOT_FOUND");
  const caseDoc = await Case.findById(rec.caseId).select("docketNumber districtId stateId").lean();
  if (!caseDoc) throw new ApiError("NOT_FOUND");
  const resource: PolicyResource = {
    districtId: caseDoc.districtId ? ID(caseDoc.districtId) : null,
    stateId: caseDoc.stateId ? ID(caseDoc.stateId) : null,
    recommendationType: rec.type as SupportType,
  };
  if (!access(user, "recommendation.decide", resource)) throw new ForbiddenError();

  const check = checkDecision({ status: rec.status as RecommendationStatus, postReviewed: !!rec.postReviewedAt }, body.decision, body.reason);
  if (!check.ok) throw new ApiError(check.code, check.detail);

  const now = new Date();
  let referralDoc: ReferralDocLike | null = null;
  let referralInsert: Record<string, unknown> | null = null;
  if (check.createsReferral) {
    const text = checkReferralText(rec.type as SupportType, body.referral);
    if (!text.ok) throw new ApiError("REFERRAL_TOO_DETAILED", text.detail);
    const assignedToId = body.referral?.assignedToId ?? null;
    if (assignedToId) {
      const assignee = await User.findOne({ _id: assignedToId, role: rec.responsibleRole, isActive: true }).select("districtId").lean();
      if (!assignee || (caseDoc.districtId && assignee.districtId && ID(assignee.districtId) !== ID(caseDoc.districtId)))
        throw new ApiError("VALIDATION_FAILED", "The assignee must be an active user with the responsible role in this district");
    }
    referralInsert = {
      _id: new mongoose.Types.ObjectId(),
      recommendationId: rec._id,
      caseId: rec.caseId,
      docketNumber: caseDoc.docketNumber,
      type: rec.type,
      targetRole: rec.responsibleRole,
      districtId: caseDoc.districtId ?? undefined,
      assignedToId: assignedToId ?? undefined,
      actionRequested: text.actionRequested,
      locationHint: text.locationHint,
      contactRoute: contactRoute(caseDoc.docketNumber),
      urgency: rec.urgency,
      dueAt: referralDueAt(rec.urgency, rec.dueAt, now),
      status: "PENDING",
      history: [{ status: "PENDING", byUserId: user.id, at: now }],
      createdAt: now,
      updatedAt: now,
    };
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const set: Record<string, unknown> =
        body.decision === "POST_REVIEW"
          ? { postReviewedAt: now, decision: { byUserId: user.id, at: now, reason: body.reason } }
          : { status: check.nextStatus, decision: { byUserId: user.id, at: now, reason: body.reason } };
      if (referralInsert) set.referralId = referralInsert._id;
      // Conditional on the status we checked, so two people deciding at once cannot both win.
      const updated = await Recommendation.updateOne(
        { _id: rec._id, status: rec.status, ...(body.decision === "POST_REVIEW" ? { postReviewedAt: null } : {}) },
        { $set: set },
        { session },
      );
      if (updated.modifiedCount !== 1) throw new ApiError("INVALID_TRANSITION", "Someone else decided this recommendation first");
      if (referralInsert) await Referral.collection.insertOne(referralInsert, { session });
      await record(
        {
          actorType: "USER",
          actorId: user.id,
          action: "recommendation.decide",
          entityType: "recommendation",
          entityId: ID(rec._id),
          metadata: { decision: body.decision, type: rec.type, ...(referralInsert ? { referralId: ID(referralInsert._id) } : {}) },
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }

  if (referralInsert) {
    referralDoc = referralInsert as unknown as ReferralDocLike;
    await publish(referralEvents("referral.created", referralDoc));
  }
  const fresh = await Recommendation.findById(rec._id).lean();
  const names = new Map([[user.id, user.name]]);
  return {
    recommendation: recommendationDto(fresh!, names),
    referral: referralDoc ? referralDto(referralDoc) : null,
  };
}

// --- referrals (GET /referrals, GET/PATCH /referrals/{id}) -------------------------------

export async function listReferrals(
  user: PolicyUser,
  q: { status?: ReferralStatus[]; type?: SupportType[]; overdue?: "true" | "false"; limit: number; cursor?: string },
  now = new Date(),
): Promise<{ items: ReferralDto[]; nextCursor: string | null }> {
  const scope = listScope(user, "referral.list");
  if (!scope) throw new ForbiddenError();
  const filter: Record<string, unknown> = {};
  if (scope.kind === "district") {
    filter.districtId = new mongoose.Types.ObjectId(scope.districtId);
    // Police and welfare see their own role's referrals only.
    if (user.role === "POLICE_LIAISON" || user.role === "WELFARE_OFFICER") filter.targetRole = user.role;
  } else if (scope.kind === "state") {
    filter.districtId = { $in: await District.find({ stateId: scope.stateId }).distinct("_id") };
  }
  if (q.status?.length) filter.status = { $in: q.status };
  if (q.type?.length) filter.type = { $in: q.type };
  if (q.overdue === "true") Object.assign(filter, { dueAt: { $lt: now }, status: { $in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] } });

  const offset = decodeCursor(q.cursor);
  // Projection whitelists the fields; case links never leave this function.
  const rows = await Referral.find(filter)
    .select("docketNumber type targetRole districtId actionRequested locationHint contactRoute urgency dueAt status outcomeNote createdAt")
    .sort({ status: 1, dueAt: 1, _id: 1 })
    .skip(offset)
    .limit(q.limit + 1)
    .lean();
  const items = rows.slice(0, q.limit).map((r) => shapeReferral(user, r as ReferralDocLike));
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

async function loadReferral(id: string) {
  if (!isId(id)) throw new ApiError("NOT_FOUND");
  const r = await Referral.findById(id);
  if (!r) throw new ApiError("NOT_FOUND");
  return r;
}

export async function getReferral(user: PolicyUser, id: string): Promise<ReferralDto> {
  const r = await loadReferral(id);
  return shapeReferral(user, r.toObject() as ReferralDocLike);
}

export async function updateReferral(user: PolicyUser, id: string, body: ReferralPatch): Promise<ReferralDto> {
  const r = await loadReferral(id);
  if (!access(user, "referral.update", referralResource(r))) throw new ForbiddenError();
  const from = r.status as ReferralStatus;
  const check = checkReferralTransition(from, body.status, body.declinedReason);
  if (!check.ok) throw new ApiError(check.code, check.detail);
  const now = new Date();
  const set: Record<string, unknown> = { status: body.status, updatedAt: now };
  if (body.outcomeNote) set.outcomeNote = body.outcomeNote;
  if (body.status === "DECLINED") set.declinedReason = body.declinedReason;
  const updated = await Referral.findOneAndUpdate(
    { _id: r._id, status: from },
    { $set: set, $push: { history: { status: body.status, byUserId: user.id as unknown as Types.ObjectId, at: now } } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new ApiError("INVALID_TRANSITION", "The referral changed; reload and try again");
  await record({
    actorType: "USER",
    actorId: user.id,
    action: "referral.update",
    entityType: "referral",
    entityId: ID(r._id),
    metadata: { from, to: body.status },
  });
  await publish(referralEvents("referral.updated", updated as ReferralDocLike));
  return shapeReferral(user, updated as ReferralDocLike);
}
