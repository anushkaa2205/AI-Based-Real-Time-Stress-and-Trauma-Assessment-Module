/** Staff-facing labels for the demo results view (presenters only; never shown to a victim). */
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";

export const DIMENSION_LABEL: Record<string, string> = {
  SUICIDAL_IDEATION: "Suicidal thoughts / self-harm",
  INTIMIDATION: "Intimidation / threat",
  SEVERE_TRAUMA: "Severe trauma",
  EXTREME_VULNERABILITY: "Extreme vulnerability",
  FEAR_ANXIETY: "Fear / anxiety",
  DEPRESSION: "Low mood",
  SOCIAL_ISOLATION: "Social isolation",
  ACUTE_STRESS: "Acute stress",
};

export const SUPPORT_LABEL: Record<string, string> = {
  EMERGENCY_SUPPORT: "Emergency support",
  POLICE_INTERVENTION: "Police intervention",
  WITNESS_PROTECTION: "Witness protection",
  MEDICAL_ASSISTANCE: "Medical assistance",
  COUNSELLING: "Counselling",
  LEGAL_AID: "Legal aid",
  REHABILITATION_RELIEF: "Rehabilitation and relief",
  INFORMATION: "Information",
};

export const SOURCE_LABEL: Record<string, string> = {
  TEXT_NLP: "AI text analysis",
  SAFETY_LEXICON: "Safety rules",
  VOICE: "Voice",
  CONTEXT: "Case details",
};

export const URGENCY_LABEL: Record<string, string> = {
  IMMEDIATE: "Immediate",
  WITHIN_15_MIN: "Within 15 min",
  WITHIN_24_H: "Within 24 h",
  WITHIN_72_H: "Within 72 h",
  NONE: "No deadline",
};

export const OVERRIDE_LABEL: Record<string, string> = Object.fromEntries(DEFAULT_CONFIG.safetyOverrides.map((o) => [o.id, o.label.en]));

export const BAND_THRESHOLDS = DEFAULT_CONFIG.bandThresholds;

export const LANGUAGE_LABEL: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi", ta: "Tamil", bn: "Bengali" };

export const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();

/** 0:05, 1:20 */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
