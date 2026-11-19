/** Case detail for staff (task 5.3, FR-CASE-03, API_CONTRACTS §5.2). Role-shaped by the serializer. */
import type { CaseDetailDto } from "@/contracts/staff";
import { serializeCaseDetail } from "@/core/policies/serializers";
import { decrypt } from "@/core/privacy/crypto";
import type { StaffUser } from "@/lib/staff-session";
import { Alert, Assessment, Recommendation } from "@/models";
import { assessmentDto, recommendationDto, userNames, userRef } from "./dto";
import type { loadCaseResource } from "./resource";

const ID = (v: unknown) => String(v);
const iso = (d: unknown) => new Date(d as Date).toISOString();
const safeDecrypt = (v: string | null | undefined) => {
  if (!v) return null;
  try {
    return decrypt(v);
  } catch {
    return null;
  }
};

export async function caseDetail(user: StaffUser, loaded: Awaited<ReturnType<typeof loadCaseResource>>): Promise<CaseDetailDto> {
  const { caseDoc, interactions, resource, latestConsent } = loaded;
  const [latest, recs, alerts] = await Promise.all([
    caseDoc.latestAssessmentId ? Assessment.findById(caseDoc.latestAssessmentId).lean() : null,
    Recommendation.find({ caseId: caseDoc._id, status: { $ne: "SUPERSEDED" } }).sort({ createdAt: -1 }).lean(),
    Alert.find({ caseId: caseDoc._id, status: "OPEN" }).select("level createdAt").lean(),
  ]);
  const names = await userNames([
    caseDoc.assignedCounsellorId,
    ...recs.map((r) => r.decision?.byUserId),
    ...(caseDoc.bandOverrides ?? []).map((o) => o.byUserId),
  ]);
  const lastInteraction = interactions.at(-1);
  const consentOk = latestConsent && latestConsent.action !== "WITHDRAWN";
  const ctx = { ...((lastInteraction?.context as Record<string, unknown> | undefined) ?? {}) };
  delete ctx.updatedAt;

  const dto: CaseDetailDto = {
    id: ID(caseDoc._id),
    docketNumber: caseDoc.docketNumber,
    isPortal: caseDoc.isPortal === true,
    status: caseDoc.status as CaseDetailDto["status"],
    band: (caseDoc.currentBand ?? null) as CaseDetailDto["band"],
    svi: caseDoc.currentSvi ?? null,
    overrideLockedBand: (caseDoc.overrideLockedBand ?? null) as CaseDetailDto["overrideLockedBand"],
    summary: safeDecrypt(caseDoc.summaryEnc),
    summaryTranslated: safeDecrypt(caseDoc.summaryTranslatedEnc),
    consent: {
      textAnalysis: !!consentOk && latestConsent!.textAnalysis,
      voiceAnalysis: !!consentOk && latestConsent!.voiceAnalysis,
      shareWithCounsellor: resource.shareWithCounsellor === true,
      followUpContact: !!consentOk && latestConsent!.followUpContact,
    },
    context: ctx,
    interactions: interactions.map((i) => ({
      id: ID(i._id),
      channel: i.channel as CaseDetailDto["interactions"][number]["channel"],
      startedAt: iso(i.startedAt),
      endedAt: i.endedAt ? iso(i.endedAt) : null,
      status: i.status,
    })),
    latestAssessment: latest ? assessmentDto(latest) : null,
    recommendations: recs.map((r) => recommendationDto(r, names)),
    openAlerts: alerts.map((a) => ({ id: ID(a._id), level: a.level as "CRITICAL" | "HIGH", createdAt: iso(a.createdAt) })),
    bandOverrides: (caseDoc.bandOverrides ?? []).map((o) => ({
      fromBand: o.fromBand,
      toBand: o.toBand,
      reason: o.reason,
      by: userRef(o.byUserId, names),
      at: iso(o.at),
    })),
    assignedTo: userRef(caseDoc.assignedCounsellorId, names),
  };
  return serializeCaseDetail(user, dto, resource);
}
