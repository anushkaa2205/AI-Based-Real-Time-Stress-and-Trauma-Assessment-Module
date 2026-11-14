/**
 * Case context → indicators (task 2.3, FR-IND-02, FR-CH-08).
 * Vulnerability comes from circumstances only. Caste and community are never
 * used (C-ETH-03), and neither is gender: it is collected for fairness
 * reporting (NFR-ETH-04), not as a risk feature.
 */
import type { CaseFact, IndicatorInput, OverrideFlag } from "./types";

export interface CaseContextInput {
  offenceCategory?: string | null;
  isSexualOffence?: boolean | null;
  familyMemberKilled?: boolean | null;
  ageGroup?: "UNDER_18" | "18_59" | "60_PLUS" | null;
  isMinor?: boolean | null;
  gender?: string | null; // deliberately unused
  hasDisability?: boolean | null;
  supportPersonPresent?: boolean | null;
  accusedNearby?: boolean | null;
  ongoingThreats?: boolean | null;
  pressureToWithdraw?: boolean | null;
  displaced?: boolean | null;
  economicDependence?: boolean | null;
  repeatVictimisation?: boolean | null;
}

/** Structured self-report: reliable, but not checked. */
const CONTEXT_CONFIDENCE = 0.9;

export interface ContextSignals {
  indicators: IndicatorInput[];
  facts: CaseFact[];
}

export function isMinor(ctx: CaseContextInput): boolean {
  return ctx.isMinor === true || ctx.ageGroup === "UNDER_18";
}

export function contextSignals(ctx: CaseContextInput | null | undefined): ContextSignals {
  const indicators: IndicatorInput[] = [];
  const facts: CaseFact[] = [];
  if (!ctx) return { indicators, facts };

  const add = (
    field: string,
    dimension: IndicatorInput["dimension"],
    score: number,
    label: string,
    flags?: OverrideFlag[],
  ) =>
    indicators.push({
      id: `context:${field}:${dimension}`,
      dimension,
      source: "CONTEXT",
      score,
      confidence: CONTEXT_CONFIDENCE,
      label,
      ...(flags?.length ? { flags } : {}),
    });

  const minor = isMinor(ctx);

  // EXTREME_VULNERABILITY (FR-IND-02); fusion keeps the strongest factor
  if (minor) add("isMinor", "EXTREME_VULNERABILITY", 0.9, "Victim is a minor");
  if (ctx.ageGroup === "60_PLUS") add("ageGroup", "EXTREME_VULNERABILITY", 0.6, "Victim is elderly");
  if (ctx.hasDisability) add("hasDisability", "EXTREME_VULNERABILITY", 0.7, "Victim has a disability");
  if (ctx.isSexualOffence) {
    facts.push("SEXUAL_OFFENCE");
    add(
      "isSexualOffence",
      "EXTREME_VULNERABILITY",
      0.85,
      minor ? "Sexual offence against a minor" : "Sexual offence",
      minor ? ["SEXUAL_OFFENCE_MINOR"] : undefined,
    );
  }
  if (ctx.familyMemberKilled) add("familyMemberKilled", "EXTREME_VULNERABILITY", 0.9, "A family member was killed");
  if (ctx.displaced) add("displaced", "EXTREME_VULNERABILITY", 0.8, "Displaced from home", ["DISPLACED"]);
  if (ctx.supportPersonPresent === false) add("supportPersonPresent", "EXTREME_VULNERABILITY", 0.5, "No support person");
  if (ctx.economicDependence) add("economicDependence", "EXTREME_VULNERABILITY", 0.6, "Economically dependent on the accused");
  if (ctx.repeatVictimisation) add("repeatVictimisation", "EXTREME_VULNERABILITY", 0.7, "Repeated victimisation");

  // INTIMIDATION
  if (ctx.accusedNearby) add("accusedNearby", "INTIMIDATION", 0.9, "Accused reported nearby now", ["ACCUSED_PRESENT"]);
  if (ctx.ongoingThreats) add("ongoingThreats", "INTIMIDATION", 0.8, "Ongoing threats reported");
  if (ctx.pressureToWithdraw) {
    add("pressureToWithdraw", "INTIMIDATION", 0.8, "Pressure to withdraw the complaint", ["PRESSURE_TO_WITHDRAW"]);
  }

  // SOCIAL_ISOLATION
  if (ctx.supportPersonPresent === false) add("supportPersonPresent", "SOCIAL_ISOLATION", 0.5, "Nobody to turn to");
  if (ctx.displaced) add("displaced", "SOCIAL_ISOLATION", 0.6, "Displaced from community");

  return { indicators, facts };
}

/** Name used in IMPLEMENTATION_PLAN.md task 2.3. */
export const contextToIndicators = contextSignals;
