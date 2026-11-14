/**
 * GET   /api/v1/staff/cases/{id}: case detail (task 5.3), audited as case.view (FR-AUD-01).
 * PATCH /api/v1/staff/cases/{id}: status and assignment (task 5.5, FR-CASE-02/05).
 */
import { CasePatchRequest } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { caseDetail } from "@/core/cases/detail";
import { loadCaseResource } from "@/core/cases/resource";
import { caseEventData } from "@/core/pipeline/score";
import { ApiError } from "@/lib/problem";
import { queueChannelsFor } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { route } from "@/lib/route";
import { Case, FollowUp, User } from "@/models";

export const GET = route({ auth: "staff", action: "case.read" }, async ({ user, params, authorize }) => {
  const loaded = await loadCaseResource(String(params.id));
  authorize("case.read", loaded.resource);
  await record({ actorType: "USER", actorId: user.id, action: "case.view", entityType: "case", entityId: String(loaded.caseDoc._id) });
  return caseDetail(user, loaded);
});

export const PATCH = route({ auth: "staff", action: "case.review", body: CasePatchRequest }, async ({ user, params, body, authorize }) => {
  const loaded = await loadCaseResource(String(params.id));
  authorize("case.review", loaded.resource);
  authorize("case.read", loaded.resource);
  const c = await Case.findById(loaded.caseDoc._id);
  if (!c) throw new ApiError("NOT_FOUND");

  if (body.status === "CLOSED" && (c.currentBand === "HIGH" || c.currentBand === "CRITICAL")) {
    // FR-REC-09: High/Critical cases close with a follow-up, or a written reason.
    const hasFollowUp = await FollowUp.exists({ caseId: c._id, status: "SCHEDULED" });
    if (!hasFollowUp && (body.reason ?? "").length < 5) throw new ApiError("FOLLOW_UP_REQUIRED", "Schedule a follow-up or give a reason for closing");
  }
  if (body.assignedCounsellorId) {
    const target = await User.findById(body.assignedCounsellorId).select("role isActive").lean();
    if (!target || !target.isActive || target.role !== "COUNSELLOR") throw new ApiError("VALIDATION_FAILED", "Assign to an active counsellor");
  }
  const before = { status: c.status, assigned: c.assignedCounsellorId ? String(c.assignedCounsellorId) : null };
  if (body.status) {
    c.status = body.status;
    if (body.status === "CLOSED") c.closedAt = new Date();
  }
  if (body.assignedCounsellorId !== undefined) c.assignedCounsellorId = (body.assignedCounsellorId ?? undefined) as never;
  c.waitingSince = new Date(); // a responder acted
  await c.save();
  await record({
    actorType: "USER",
    actorId: user.id,
    action: "case.update",
    entityType: "case",
    entityId: String(c._id),
    metadata: { fromStatus: before.status, toStatus: c.status, assignedChanged: before.assigned !== (c.assignedCounsellorId ? String(c.assignedCounsellorId) : null) },
  });
  await publish(queueChannelsFor(c.districtId ? String(c.districtId) : null).map((channel) => ({ channel, event: "case.updated" as const, data: caseEventData(c.toObject()) })));
  return caseDetail(user, await loadCaseResource(String(c._id)));
});
