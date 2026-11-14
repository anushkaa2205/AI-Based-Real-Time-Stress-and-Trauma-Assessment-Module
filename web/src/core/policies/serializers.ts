/**
 * Role-shaped output (task 1.7, NFR-PRI-02, API_CONTRACTS §4–5).
 * Every serializer whitelists fields; nothing is copied by spreading.
 * Police and welfare roles have no code path to case, transcript, indicator
 * or assessment data: the case/assessment serializers refuse them outright,
 * and their only serializer is `serializeReferral` (CLAUDE.md rule 8).
 */
import type {
  AssessmentDto,
  AssessmentSummaryDto,
  CaseDetailDto,
  CaseQueueItem,
  ReferralDto,
} from "@/contracts/staff";
import { access, type PolicyResource, type PolicyUser } from "./rbac";

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor() {
    super("Not allowed");
    this.name = "ForbiddenError";
  }
}

export function serializeAssessment(
  user: PolicyUser,
  a: AssessmentDto,
  resource?: PolicyResource,
): AssessmentDto | AssessmentSummaryDto {
  const level = access(user, "case.assessment.read", resource);
  if (!level) throw new ForbiddenError();
  if (level === "reduced") {
    return { id: a.id, interactionId: a.interactionId, seq: a.seq, svi: a.svi, band: a.band, createdAt: a.createdAt };
  }
  return {
    id: a.id,
    interactionId: a.interactionId,
    seq: a.seq,
    trigger: a.trigger,
    svi: a.svi,
    computedBand: a.computedBand,
    band: a.band,
    overridesFired: a.overridesFired,
    dimensions: a.dimensions,
    confidence: a.confidence,
    limitedConfidence: a.limitedConfidence,
    topEvidence: a.topEvidence,
    explanation: a.explanation,
    configVersion: a.configVersion,
    createdAt: a.createdAt,
  };
}

export function serializeCaseQueueItem(user: PolicyUser, c: CaseQueueItem, resource?: PolicyResource): CaseQueueItem {
  const level = access(user, "case.list", resource);
  if (!level) throw new ForbiddenError();
  const base: CaseQueueItem = {
    id: c.id,
    docketNumber: c.docketNumber,
    band: c.band,
    svi: c.svi,
    status: c.status,
    district: c.district,
    assignedTo: c.assignedTo,
    waitingSince: c.waitingSince,
    limitedConfidence: c.limitedConfidence,
    openAlert: c.openAlert,
  };
  if (level === "reduced") return base; // no topReason: it is derived from evidence
  return { ...base, channel: c.channel, language: c.language, topReason: c.topReason };
}

export function serializeCaseDetail(user: PolicyUser, c: CaseDetailDto, resource?: PolicyResource): CaseDetailDto {
  const level = access(user, "case.read", resource);
  if (!level) throw new ForbiddenError();
  const latest = c.latestAssessment && "trigger" in c.latestAssessment ? c.latestAssessment : null;
  const shaped: CaseDetailDto = {
    id: c.id,
    docketNumber: c.docketNumber,
    status: c.status,
    band: c.band,
    svi: c.svi,
    overrideLockedBand: c.overrideLockedBand,
    consent: c.consent,
    interactions: c.interactions,
    latestAssessment: latest
      ? level === "reduced"
        ? { id: latest.id, interactionId: latest.interactionId, seq: latest.seq, svi: latest.svi, band: latest.band, createdAt: latest.createdAt }
        : serializeAssessment(user, latest, resource)
      : null,
    recommendations: c.recommendations,
    openAlerts: c.openAlerts,
    bandOverrides: c.bandOverrides,
    assignedTo: c.assignedTo,
  };
  if (level === "reduced") return shaped; // §5.2: no summary, context, screeners, dimensions, evidence
  return {
    ...shaped,
    summary: c.summary,
    summaryTranslated: c.summaryTranslated,
    context: c.context,
    screenerScores: c.screenerScores,
  };
}

/** Referral: already minimal; whitelisted again so extra fields can never leak. */
export function serializeReferral(user: PolicyUser, r: ReferralDto, resource?: PolicyResource): ReferralDto {
  if (!access(user, "referral.list", resource)) throw new ForbiddenError();
  const out: ReferralDto = {
    id: r.id,
    docketNumber: r.docketNumber,
    type: r.type,
    actionRequested: r.actionRequested,
    contactRoute: r.contactRoute,
    urgency: r.urgency,
    status: r.status,
    createdAt: r.createdAt,
  };
  if (r.locationHint !== undefined) out.locationHint = r.locationHint;
  if (r.dueAt !== undefined) out.dueAt = r.dueAt;
  if (r.outcomeNote !== undefined) out.outcomeNote = r.outcomeNote;
  return out;
}
