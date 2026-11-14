/** Shared Zod types (API_CONTRACTS.md §2). Enum values come from the models. */
import { z } from "zod";
import {
  ASSESSMENT_TRIGGERS,
  CASE_STATUSES,
  CHANNELS,
  DIMENSIONS,
  INDICATOR_STATUSES,
  RECOMMENDATION_STATUSES,
  REFERRAL_STATUSES,
  RISK_BANDS,
  ROLES,
  SIGNAL_SOURCES,
  SUPPORT_TYPES,
  URGENCIES,
} from "@/models/enums";

export const ObjectIdStr = z.string().regex(/^[a-f0-9]{24}$/, "must be a 24-character hex id");
export const Iso = z.iso.datetime();
export const Lang = z.enum(["en", "hi", "hi-Latn", "mr", "ta", "bn"]);

export const Role = z.enum(ROLES);
export const Channel = z.enum(CHANNELS);
export const RiskBand = z.enum(RISK_BANDS);
export const Dimension = z.enum(DIMENSIONS);
export const SignalSource = z.enum(SIGNAL_SOURCES);
export const SupportType = z.enum(SUPPORT_TYPES);
export const Urgency = z.enum(URGENCIES);
export const CaseStatus = z.enum(CASE_STATUSES);
export const AssessmentTrigger = z.enum(ASSESSMENT_TRIGGERS);
export const IndicatorStatus = z.enum(INDICATOR_STATUSES);
export const RecommendationStatus = z.enum(RECOMMENDATION_STATUSES);
export const ReferralStatus = z.enum(REFERRAL_STATUSES);

export const UserRef = z.object({ id: ObjectIdStr, name: z.string() });

export const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
