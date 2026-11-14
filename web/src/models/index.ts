/** Barrel for the assessment-database models (task 1.2). PII lives in ./subject-identity. */
import { Alert } from "./alert";
import { ApiClient } from "./api-client";
import { Assessment } from "./assessment";
import { AuditLog } from "./audit-log";
import { Case } from "./case";
import { CaseNote } from "./case-note";
import { DailyStat } from "./daily-stat";
import { District } from "./district";
import { FollowUp } from "./follow-up";
import { Indicator } from "./indicator";
import { Interaction } from "./interaction";
import { Job } from "./job";
import { Message } from "./message";
import { RateLimit } from "./rate-limit";
import { Recommendation } from "./recommendation";
import { Referral } from "./referral";
import { ScoringConfig } from "./scoring-config";
import { State } from "./state";
import { StoredAudio } from "./stored-audio";
import { Subject } from "./subject";
import { User } from "./user";
import { VoiceWindow } from "./voice-window";

export * from "./enums";
export type { CaseDoc } from "./case";
export type { InteractionDoc } from "./interaction";
export type { IndicatorDoc } from "./indicator";
export type { AssessmentDoc } from "./assessment";
export {
  Alert,
  ApiClient,
  Assessment,
  AuditLog,
  Case,
  CaseNote,
  DailyStat,
  District,
  FollowUp,
  Indicator,
  Interaction,
  Job,
  Message,
  RateLimit,
  Recommendation,
  Referral,
  ScoringConfig,
  State,
  StoredAudio,
  Subject,
  User,
  VoiceWindow,
};

/** Every model on the default (assessment) connection, for index syncing. */
export const ASSESS_MODELS = [
  State,
  District,
  User,
  ApiClient,
  Subject,
  Case,
  Interaction,
  Message,
  VoiceWindow,
  StoredAudio,
  Indicator,
  Assessment,
  ScoringConfig,
  CaseNote,
  Recommendation,
  Referral,
  Alert,
  FollowUp,
  AuditLog,
  Job,
  DailyStat,
  RateLimit,
] as const;
