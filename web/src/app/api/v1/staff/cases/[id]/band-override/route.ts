/**
 * POST /api/v1/staff/cases/{id}/band-override (task 5.5, FR-RISK-03, FR-CASE-04, AC-CASE-02).
 * Only a human, with a written reason (≥ 5 characters), can change a band, including
 * lowering a band locked by a safety override. The new band becomes the lock.
 */
import { BandOverrideRequest } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { loadCaseResource } from "@/core/cases/resource";
import { caseEventData } from "@/core/pipeline/score";
import { bandRank } from "@/core/scoring/bands";
import { ApiError } from "@/lib/problem";
import { queueChannelsFor } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { route } from "@/lib/route";
import { Case } from "@/models";

export const POST = route({ auth: "staff", action: "case.review", body: BandOverrideRequest }, async ({ user, params, body, authorize }) => {
  if ((body.reason ?? "").length < 5) throw new ApiError("REASON_REQUIRED", "Give a reason of at least 5 characters");
  const loaded = await loadCaseResource(String(params.id));
  authorize("case.review", loaded.resource);
  authorize("case.read", loaded.resource);
  const c = await Case.findById(loaded.caseDoc._id);
  if (!c) throw new ApiError("NOT_FOUND");
  const fromBand = c.currentBand ?? "LOW";
  c.bandOverrides.push({ fromBand, toBand: body.toBand, reason: body.reason!, byUserId: user.id as never, at: new Date() });
  c.currentBand = body.toBand;
  c.bandRank = bandRank(body.toBand);
  c.overrideLockedBand = body.toBand;
  c.waitingSince = new Date();
  await c.save();
  await record({
    actorType: "USER",
    actorId: user.id,
    action: "band.override",
    entityType: "case",
    entityId: String(c._id),
    metadata: { fromBand, toBand: body.toBand },
  });
  await publish(queueChannelsFor(c.districtId ? String(c.districtId) : null).map((channel) => ({ channel, event: "case.updated" as const, data: caseEventData(c.toObject()) })));
  return Response.json({ band: c.currentBand, overrideLockedBand: c.overrideLockedBand }, { status: 201 });
});
