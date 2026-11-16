/**
 * Staff API contracts used so far (API_CONTRACTS.md §2, §5). Staff-only:
 * none of these shapes may ever be sent to a victim (CLAUDE.md rule 1).
 */
import { z } from "zod";
import {
  AssessmentTrigger,
  CaseStatus,
  Channel,
  Dimension,
  Iso,
  Lang,
  ObjectIdStr,
  RiskBand,
  Role,
  SignalSource,
  SupportType,
  Urgency,
  ReferralStatus,
  UserRef,
} from "./common";

// --- §5.1 session ---------------------------------------------------------

export const LoginRequest = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });
export const LoginResponse = z.object({ requiresTotp: z.boolean() });
export const TotpRequest = z.object({ code: z.string().regex(/^\d{6}$/, "must be 6 digits") });

export const Me = z.object({
  id: ObjectIdStr,
  name: z.string(),
  role: Role,
  districtId: ObjectIdStr.nullable(),
  stateId: ObjectIdStr.nullable(),
  languages: z.array(z.string()),
  isOnDuty: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const DutyRequest = z.object({ isOnDuty: z.boolean() });

export const Health = z.object({
  db: z.enum(["ok", "down"]),
  analysis: z.enum(["ok", "degraded"]),
  realtime: z.enum(["ok", "degraded"]),
});

// --- §2 DTOs ------------------------------------------------------------------

const DimensionEntry = z.object({
  score: z.number(),
  confidence: z.number(),
  contribution: z.number(),
  bySource: z.partialRecord(SignalSource, z.number()),
});

export const AssessmentDto = z.object({
  id: ObjectIdStr,
  interactionId: ObjectIdStr,
  seq: z.number().int(),
  trigger: AssessmentTrigger,
  svi: z.number().int().min(0).max(100),
  computedBand: RiskBand,
  band: RiskBand,
  overridesFired: z.array(z.string()),
  dimensions: z.partialRecord(Dimension, DimensionEntry),
  confidence: z.number(),
  limitedConfidence: z.boolean(),
  // indicatorId is null when the evidence is a questionnaire answer or case context
  topEvidence: z.array(z.object({ indicatorId: ObjectIdStr.nullable(), dimension: Dimension, label: z.string() })),
  explanation: z.string(),
  configVersion: z.number().int(),
  createdAt: Iso,
});
export type AssessmentDto = z.infer<typeof AssessmentDto>;

/** District / state view of an assessment: band and SVI only (§4 🔒). */
export const AssessmentSummaryDto = AssessmentDto.pick({ id: true, interactionId: true, seq: true, svi: true, band: true, createdAt: true });
export type AssessmentSummaryDto = z.infer<typeof AssessmentSummaryDto>;

export const CaseQueueItem = z.object({
  id: ObjectIdStr,
  docketNumber: z.string(),
  band: RiskBand.nullable(),
  svi: z.number().nullable(),
  status: CaseStatus,
  channel: Channel.optional(),
  language: Lang.optional(),
  district: z.object({ id: ObjectIdStr, name: z.string() }).nullable(),
  assignedTo: UserRef.nullable(),
  waitingSince: Iso,
  topReason: z.string().optional(),
  limitedConfidence: z.boolean(),
  openAlert: z.object({ id: ObjectIdStr, level: z.enum(["CRITICAL", "HIGH"]), escalationLevel: z.number() }).nullable(),
});
export type CaseQueueItem = z.infer<typeof CaseQueueItem>;

export const CaseDetailDto = z.object({
  id: ObjectIdStr,
  docketNumber: z.string(),
  status: CaseStatus,
  band: RiskBand.nullable(),
  svi: z.number().nullable(),
  overrideLockedBand: RiskBand.nullable(),
  summary: z.string().nullable().optional(),
  summaryTranslated: z.string().nullable().optional(),
  consent: z.object({
    textAnalysis: z.boolean(),
    voiceAnalysis: z.boolean(),
    shareWithCounsellor: z.boolean(),
    followUpContact: z.boolean(),
  }),
  context: z.record(z.string(), z.unknown()).optional(),
  interactions: z.array(
    z.object({ id: ObjectIdStr, channel: Channel, startedAt: Iso, endedAt: Iso.nullable(), status: z.string() }),
  ),
  latestAssessment: z.union([AssessmentDto, AssessmentSummaryDto]).nullable(),
  recommendations: z.array(z.unknown()),
  openAlerts: z.array(z.object({ id: ObjectIdStr, level: z.enum(["CRITICAL", "HIGH"]), createdAt: Iso })),
  bandOverrides: z.array(z.unknown()),
  assignedTo: UserRef.nullable(),
});
export type CaseDetailDto = z.infer<typeof CaseDetailDto>;

/** The ONLY case data police and welfare roles receive (C-ETH-02). */
export const ReferralDto = z.object({
  id: ObjectIdStr,
  docketNumber: z.string(),
  type: SupportType,
  actionRequested: z.string().max(300),
  locationHint: z.string().optional(),
  contactRoute: z.string(),
  urgency: Urgency,
  dueAt: Iso.optional(),
  status: ReferralStatus,
  outcomeNote: z.string().optional(),
  createdAt: Iso,
});
export type ReferralDto = z.infer<typeof ReferralDto>;

// --- Phase 5: queue, detail, review, override, notes, alerts (API_CONTRACTS §5.2–5.6) ---

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : String(v).split(",")).filter(Boolean)), z.array(item).optional());

export const CaseQueueQuery = z.object({
  status: csv(CaseStatus),
  band: csv(RiskBand),
  districtId: ObjectIdStr.optional(),
  assignedTo: z.union([z.enum(["me", "unassigned"]), ObjectIdStr]).optional(),
  channel: Channel.optional(),
  language: z.string().max(10).optional(),
  from: Iso.optional(),
  to: Iso.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(40).optional(),
});

export const IndicatorDto = z.object({
  id: ObjectIdStr,
  dimension: Dimension,
  source: SignalSource,
  score: z.number(),
  confidence: z.number(),
  negated: z.boolean(),
  status: z.enum(["ACTIVE", "CONFIRMED", "REJECTED", "ADJUSTED"]),
  flags: z.array(z.string()),
  label: z.string().nullable(),
  evidence: z.union([
    z.object({ type: z.literal("TEXT_SPAN"), messageId: ObjectIdStr, spanStart: z.number(), spanEnd: z.number(), quote: z.string().nullable() }),
    z.object({ type: z.enum(["ACOUSTIC_EVENT", "CONTEXT_FIELD"]) }).loose(),
  ]),
  review: z.object({ score: z.number().nullable(), reason: z.string(), by: UserRef, at: Iso }).nullable(),
  modelVersion: z.string(),
  createdAt: Iso,
});
export type IndicatorDto = z.infer<typeof IndicatorDto>;

export const RecommendationDto = z.object({
  id: ObjectIdStr,
  type: SupportType,
  ruleId: z.string(),
  reason: z.string(),
  urgency: Urgency,
  dueAt: Iso.optional(),
  responsibleRole: Role,
  legalBasis: z.string().optional(),
  status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "AUTO_TRIGGERED", "SUPERSEDED"]),
  decision: z.object({ by: UserRef, at: Iso, reason: z.string().optional() }).optional(),
  referralId: ObjectIdStr.optional(),
});
export type RecommendationDto = z.infer<typeof RecommendationDto>;

export const TranscriptItem = z.object({
  id: ObjectIdStr,
  seq: z.number(),
  sender: z.enum(["VICTIM", "SYSTEM", "OPERATOR"]),
  modality: z.string(),
  text: z.string(),
  translation: z.string().nullable(),
  language: z.string().nullable(),
  sttConfidence: z.number().nullable(),
  emotion: z.object({ label: z.string(), confidence: z.number() }).nullable(),
  createdAt: Iso,
});

export const IndicatorReviewRequest = z
  .object({
    action: z.enum(["CONFIRM", "REJECT", "ADJUST"]),
    reason: z.string().trim().max(500).optional(),
    score: z.number().min(0).max(1).optional(),
  })
  .refine((r) => r.action !== "ADJUST" || r.score !== undefined, { message: "score is required to adjust", path: ["score"] });

export const BandOverrideRequest = z.object({ toBand: RiskBand, reason: z.string().trim().max(500).optional() });

export const NoteRequest = z.object({ body: z.string().trim().min(1).max(4000) });

export const CasePatchRequest = z
  .object({
    status: CaseStatus.optional(),
    assignedCounsellorId: ObjectIdStr.nullable().optional(),
    /** Additive: why a High/Critical case is closed without a follow-up */
    reason: z.string().trim().max(500).optional(),
  })
  .refine((p) => p.status !== undefined || p.assignedCounsellorId !== undefined, { message: "nothing to change" });

export const AlertQuery = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).default("OPEN"),
  level: z.enum(["CRITICAL", "HIGH"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(40).optional(),
});

export const AlertItem = z.object({
  id: ObjectIdStr,
  caseId: ObjectIdStr,
  docketNumber: z.string(),
  level: z.enum(["CRITICAL", "HIGH"]),
  reason: z.string(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]),
  escalationLevel: z.number(),
  createdAt: Iso,
  acknowledgedAt: Iso.nullable(),
});
export type AlertItem = z.infer<typeof AlertItem>;

export const ResolveRequest = z.object({ note: z.string().trim().max(500).optional() });

/** Opaque offset cursor for list endpoints. */
export const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`).toString("base64url");
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const m = /^o:(\d{1,6})$/.exec(Buffer.from(cursor, "base64url").toString());
  return m ? Number(m[1]) : 0;
}

// --- Phase 6: recommendations, referrals, follow-ups (API_CONTRACTS §5.5, §5.7) ---

export const RecommendationQuery = z.object({
  status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "AUTO_TRIGGERED", "SUPERSEDED"]).default("PROPOSED"),
  responsibleRole: Role.optional(),
  districtId: ObjectIdStr.optional(),
  /** AUTO_TRIGGERED emergency support still waiting for its human review (FR-REC-05). */
  needsReview: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(40).optional(),
});

export const RecommendationInboxItem = RecommendationDto.extend({
  caseId: ObjectIdStr,
  docketNumber: z.string(),
  band: RiskBand.nullable(),
  postReviewedAt: Iso.nullable(),
});
export type RecommendationInboxItem = z.infer<typeof RecommendationInboxItem>;

/** Referral text is what police and welfare see; length is checked in the service (422 REFERRAL_TOO_DETAILED). */
export const DecisionRequest = z.object({
  decision: z.enum(["APPROVE", "REJECT", "POST_REVIEW"]),
  reason: z.string().trim().max(500).optional(),
  referral: z
    .object({
      actionRequested: z.string().trim().max(2000).optional(),
      locationHint: z.string().trim().max(2000).optional(),
      assignedToId: ObjectIdStr.nullable().optional(),
    })
    .optional(),
});
export type DecisionRequest = z.infer<typeof DecisionRequest>;

export const ReferralQuery = z.object({
  status: csv(ReferralStatus),
  type: csv(SupportType),
  /** Only referrals past their due time that are still open. */
  overdue: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(40).optional(),
});

/** §5.5 lists IN_PROGRESS | DONE | DECLINED; ACCEPTED is added because the transition table starts PENDING → ACCEPTED. */
export const ReferralPatch = z.object({
  status: z.enum(["ACCEPTED", "IN_PROGRESS", "DONE", "DECLINED"]),
  outcomeNote: z.string().trim().max(500).optional(),
  declinedReason: z.string().trim().max(500).optional(),
});
export type ReferralPatch = z.infer<typeof ReferralPatch>;

export const FollowUpQuery = z.object({
  status: z.enum(["SCHEDULED", "DONE", "MISSED", "CANCELLED"]).default("SCHEDULED"),
  due: z.enum(["today", "overdue", "all"]).default("all"),
  caseId: ObjectIdStr.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(40).optional(),
});

export const FollowUpCreate = z.object({
  dueAt: Iso,
  channel: Channel,
  assignedToId: ObjectIdStr.nullable().optional(),
});

export const FollowUpPatch = z.object({
  status: z.enum(["DONE", "MISSED", "CANCELLED"]),
  outcomeNote: z.string().trim().max(500).optional(),
});

export const FollowUpItem = z.object({
  id: ObjectIdStr,
  caseId: ObjectIdStr,
  docketNumber: z.string(),
  dueAt: Iso,
  channel: Channel,
  status: z.enum(["SCHEDULED", "DONE", "MISSED", "CANCELLED"]),
  assignedTo: UserRef.nullable(),
  outcomeNote: z.string().optional(),
});
export type FollowUpItem = z.infer<typeof FollowUpItem>;

// --- Phase 8: analytics (API_CONTRACTS §5.8) -----------------------------------------------

export const AnalyticsQuery = z.object({
  scope: z.enum(["national", "state", "district"]).default("national"),
  stateId: ObjectIdStr.optional(),
  districtId: ObjectIdStr.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  channel: Channel.optional(),
  language: z.string().max(10).optional(),
  /** FR-DSH-07 band filter (additive) */
  band: RiskBand.optional(),
  interval: z.enum(["day", "week"]).default("day"),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;

// --- Phase 8: administration (API_CONTRACTS §5.9) ------------------------------------------

export const AdminUserCreate = z.object({
  email: z.email().max(200),
  name: z.string().trim().min(2).max(100),
  role: Role,
  districtId: ObjectIdStr.nullable().optional(),
  languages: z.array(z.string().max(10)).max(6).optional(),
});

export const AdminUserPatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: Role.optional(),
  districtId: ObjectIdStr.nullable().optional(),
  isActive: z.boolean().optional(),
  /** Issue a new temporary password (shown once) */
  resetPassword: z.boolean().optional(),
});

export const ApiClientCreate = z.object({
  name: z.string().trim().min(2).max(100),
  scopes: z.array(z.enum(["interactions:write", "assessments:read", "stream:read"])).min(1),
  rateLimitPerMin: z.number().int().min(1).max(10_000).default(120),
});

export const AuditQuery = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(40).optional(),
  actorId: z.string().max(40).optional(),
  action: z.string().max(60).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().max(40).optional(),
});
