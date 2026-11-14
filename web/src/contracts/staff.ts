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
  topEvidence: z.array(z.object({ indicatorId: ObjectIdStr, dimension: Dimension, label: z.string() })),
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
  screenerScores: z
    .array(z.object({ instrument: z.string(), total: z.number(), maxTotal: z.number(), isPositive: z.boolean() }))
    .optional(),
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
