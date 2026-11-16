/** Emergency options for the calling system to show the person (FR-REC-06): numbers and calm wording only, no risk labels. */
import type { EmergencyPanel, VictimLang } from "@/contracts/interaction";
import { t } from "@/core/i18n/messages";
import type { RiskBand } from "@/models/enums";

export function emergencyPanel(lang: VictimLang): EmergencyPanel {
  return {
    numbers: [
      { label: t(lang, "emergency.police"), number: "112" },
      { label: t(lang, "emergency.teleManas"), number: "14416" },
      { label: t(lang, "emergency.nhaa"), number: "14566" },
    ],
    message: t(lang, "emergency.message"),
  };
}

/** The ONLY risk signal in a response a calling system may show the person (CLAUDE.md rule 1). */
export function shouldShowEmergency(band: RiskBand | null | undefined): boolean {
  return band === "CRITICAL";
}
