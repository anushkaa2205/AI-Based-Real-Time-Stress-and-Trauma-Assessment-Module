/**
 * One plain sentence per assessment for responders, in English and Hindi
 * (task 2.7, FR-RISK-04). Staff-facing only: never shown to victims (rule 1).
 * The Hindi wording should be reviewed by a native speaker (NFR-ACC-04).
 */
import type { Dimension, OverrideRule, RiskBand } from "./types";

export type ExplainLang = "en" | "hi";

const BAND: Record<RiskBand, Record<ExplainLang, string>> = {
  LOW: { en: "Low", hi: "निम्न" },
  MODERATE: { en: "Moderate", hi: "मध्यम" },
  HIGH: { en: "High", hi: "उच्च" },
  CRITICAL: { en: "Critical", hi: "गंभीर" },
};

export const DIMENSION_LABEL: Record<Dimension, Record<ExplainLang, string>> = {
  ACUTE_STRESS: { en: "acute stress", hi: "तीव्र तनाव" },
  SEVERE_TRAUMA: { en: "severe trauma", hi: "गंभीर आघात" },
  FEAR_ANXIETY: { en: "fear or anxiety", hi: "डर या चिंता" },
  DEPRESSION: { en: "low mood", hi: "उदासी" },
  SUICIDAL_IDEATION: { en: "suicidal thoughts", hi: "आत्महत्या के विचार" },
  INTIMIDATION: { en: "threats or intimidation", hi: "धमकी या डराना" },
  SOCIAL_ISOLATION: { en: "social isolation", hi: "सामाजिक अलगाव" },
  EXTREME_VULNERABILITY: { en: "high vulnerability", hi: "अधिक असुरक्षा" },
};

const TEXT = {
  en: { strongest: "strongest signals", none: "no warning signs detected so far", limited: "Limited AI analysis." },
  hi: { strongest: "मुख्य संकेत", none: "अभी तक कोई चेतावनी संकेत नहीं मिला", limited: "सीमित AI विश्लेषण।" },
} as const;

export interface ExplainInput {
  band: RiskBand;
  svi: number;
  overridesFired: readonly string[];
  overrideRules: readonly OverrideRule[];
  /** Dimensions ordered by contribution, highest first, with contribution > 0 */
  topDimensions: readonly Dimension[];
  limitedConfidence: boolean;
}

export function explain(input: ExplainInput, lang: ExplainLang): string {
  const t = TEXT[lang];
  const parts: string[] = [];
  const first = input.overridesFired[0];
  const rule = first ? input.overrideRules.find((r) => r.id === first) : undefined;
  if (rule) parts.push(`${rule.label[lang]} (${rule.id})`);

  const dims = input.topDimensions.slice(0, 2).map((d) => DIMENSION_LABEL[d][lang]);
  if (dims.length) parts.push(`${t.strongest}: ${dims.join(", ")}`);
  if (!parts.length) parts.push(t.none);

  const sentence = `${BAND[input.band][lang]} (SVI ${input.svi}): ${parts.join("; ")}.`;
  return input.limitedConfidence ? `${sentence} ${t.limited}` : sentence;
}
