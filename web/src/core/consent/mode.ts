/**
 * Consent → assessment mode (task 3.3, FR-CON-01…06). Pure.
 * The safety check runs in EVERY mode (FR-SCR-01, CLAUDE.md rule 6); the mode
 * only decides what else may be analysed.
 */
import type { AssessmentMode } from "@/models/enums";

export const NOTICE_VERSION = "2026-11-v1";

export interface ConsentChoices {
  action?: "GRANTED" | "UPDATED" | "WITHDRAWN";
  textAnalysis: boolean;
  voiceAnalysis: boolean;
  shareWithCounsellor?: boolean;
  followUpContact?: boolean;
  audioRetention?: boolean;
  guardianConsent?: boolean | null;
}

/** The consent in force: the latest entry, or none after a withdrawal. */
export function currentConsent<T extends ConsentChoices>(entries: readonly T[]): T | null {
  const last = entries.at(-1);
  return !last || last.action === "WITHDRAWN" ? null : last;
}

/**
 * FR-CON-02/03/05: no consent → SAFETY_ONLY. A minor without a guardian's
 * consent gets SAFETY_ONLY and is routed to a human counsellor.
 */
export function resolveMode(consent: ConsentChoices | null, opts: { isMinor: boolean }): AssessmentMode {
  if (!consent) return "SAFETY_ONLY";
  if (opts.isMinor && consent.guardianConsent !== true) return "SAFETY_ONLY";
  if (consent.textAnalysis && consent.voiceAnalysis) return "FULL";
  if (consent.textAnalysis) return "TEXT_ONLY";
  if (consent.voiceAnalysis) return "VOICE_ONLY";
  return "SAFETY_ONLY";
}

export const allowsTextAnalysis = (mode: AssessmentMode): boolean => mode === "FULL" || mode === "TEXT_ONLY";
export const allowsVoiceAnalysis = (mode: AssessmentMode): boolean => mode === "FULL" || mode === "VOICE_ONLY";
/** Any analysis consent at all (text or voice): the assessment is scored; otherwise only safety overrides apply (AC-CON-03). */
export const allowsAnyAnalysis = (mode: AssessmentMode): boolean => mode !== "SAFETY_ONLY";
