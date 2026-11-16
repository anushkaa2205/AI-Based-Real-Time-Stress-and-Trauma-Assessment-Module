/**
 * GET /api/v1/staff/interactions/{id}/suggested-questions (API_CONTRACTS §5.3, FR-CH-04, FR-DSH-01).
 * Scripted questions only (rule 2) for the operator to ask aloud, in the caller's language with
 * English alongside. There are no structured answers (PRODUCT_VISION §5); the answers arrive as speech.
 */
import { toVictimLang } from "@/contracts/interaction";
import { suggestQuestions } from "@/core/operator/suggest";
import { loadInteractionResource } from "@/core/cases/resource";
import { t } from "@/core/i18n/messages";
import type { Dimension } from "@/core/scoring/types";
import { route } from "@/lib/route";
import { Assessment, Interaction } from "@/models";

export const GET = route({ auth: "staff", action: "case.read" }, async ({ params, authorize }) => {
  const id = String(params.id);
  const { resource } = await loadInteractionResource(id);
  authorize("case.read", resource);
  const [interaction, latest] = await Promise.all([
    Interaction.findById(id).select("uiLanguage").lean(),
    Assessment.findOne({ interactionId: id }).sort({ seq: -1 }).select("dimensions overridesFired").lean(),
  ]);
  const raw = (latest?.dimensions instanceof Map ? Object.fromEntries(latest.dimensions) : latest?.dimensions) as Record<string, { score?: number }> | undefined;
  const dimensions: Partial<Record<Dimension, number>> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (v?.score != null) dimensions[k as Dimension] = v.score;
  const lang = toVictimLang(interaction?.uiLanguage);
  const items = suggestQuestions({
    dimensions,
    suicideSignal: (dimensions.SUICIDAL_IDEATION ?? 0) > 0,
    notSafeNow: (latest?.overridesFired ?? []).includes("OV-9"),
  }).map((s) => ({
    key: s.key,
    text: t(lang, s.key),
    textEn: t("en", s.key),
    reason: s.reason,
  }));
  return { items };
});
