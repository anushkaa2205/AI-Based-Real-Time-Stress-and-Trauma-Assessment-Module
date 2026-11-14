/**
 * PATCH /api/v1/staff/indicators/{id} (task 5.4, FR-IND-05, AC-IND-02).
 * Confirm, reject or adjust with a reason. The original AI value is kept; the
 * SVI is recalculated at once (trigger INDICATOR_REVIEW). A safety-override lock
 * is NOT released by this; only a band override can do that (FR-RISK-03).
 */
import mongoose from "mongoose";
import { IndicatorReviewRequest } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { assessmentDto, indicatorDto, userNames } from "@/core/cases/dto";
import { loadCaseResource } from "@/core/cases/resource";
import { scoreInteraction } from "@/core/pipeline/score";
import { serializeAssessment } from "@/core/policies/serializers";
import { activeConfig } from "@/core/scoring/activeConfig";
import { ApiError } from "@/lib/problem";
import type { OutboundEvent } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { route } from "@/lib/route";
import { Assessment, Case, Indicator, Interaction } from "@/models";

const STATUS = { CONFIRM: "CONFIRMED", REJECT: "REJECTED", ADJUST: "ADJUSTED" } as const;

export const PATCH = route({ auth: "staff", action: "case.review", body: IndicatorReviewRequest }, async ({ user, params, body, authorize }) => {
  if ((body.reason ?? "").length < 5) throw new ApiError("REASON_REQUIRED", "Give a reason of at least 5 characters");
  const id = String(params.id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const found = await Indicator.findById(id).select("caseId interactionId").lean();
  if (!found) throw new ApiError("NOT_FOUND");
  const { resource } = await loadCaseResource(String(found.caseId));
  authorize("case.review", resource);
  authorize("case.read", resource);

  const config = await activeConfig();
  const now = new Date();
  let events: OutboundEvent[] = [];
  let assessmentId: string | null = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ind = await Indicator.findById(id).session(session);
      const interaction = await Interaction.findById(found.interactionId).session(session);
      const caseDoc = await Case.findById(found.caseId).session(session);
      if (!ind || !interaction || !caseDoc) throw new ApiError("NOT_FOUND");
      const fromScore = ind.review?.score ?? ind.score;
      ind.status = STATUS[body.action];
      // The original `score` is never overwritten; the reviewer's value lives in `review`.
      ind.review = { score: body.action === "ADJUST" ? body.score : undefined, reason: body.reason!, byUserId: user.id as never, at: now };
      await ind.save({ session });
      const scored = await scoreInteraction(session, interaction, caseDoc, {
        trigger: "INDICATOR_REVIEW",
        now,
        config,
        actor: { type: "USER", id: user.id },
      });
      caseDoc.waitingSince = now;
      await interaction.save({ session });
      await caseDoc.save({ session });
      await record(
        {
          actorType: "USER",
          actorId: user.id,
          action: "indicator.review",
          entityType: "indicator",
          entityId: id,
          metadata: { action: body.action, fromScore, toScore: body.action === "ADJUST" ? (body.score ?? null) : body.action === "REJECT" ? 0 : fromScore },
        },
        session,
      );
      events = scored.events;
      assessmentId = scored.assessmentId;
    });
  } finally {
    await session.endSession();
  }
  await publish(events);

  const [ind, assessment] = await Promise.all([Indicator.findById(id).lean(), assessmentId ? Assessment.findById(assessmentId).lean() : null]);
  const names = await userNames([ind?.review?.byUserId]);
  return {
    indicator: indicatorDto(ind!, names),
    assessment: assessment ? serializeAssessment(user, assessmentDto(assessment), resource) : null,
  };
});
