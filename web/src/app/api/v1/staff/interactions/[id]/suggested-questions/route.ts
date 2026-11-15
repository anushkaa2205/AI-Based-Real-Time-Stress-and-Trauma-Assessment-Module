/**
 * GET /api/v1/staff/interactions/{id}/suggested-questions (API_CONTRACTS §5.3, FR-CH-04).
 * Scripted questions only (rule 2), in the caller's language with English alongside.
 */
import { toVictimLang } from "@/contracts/victim";
import { flowStateOf } from "@/core/conversation/flow";
import { suggestQuestions } from "@/core/conversation/suggest";
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
    Interaction.findById(id).select("screenerResponses flowState uiLanguage").lean(),
    Assessment.findOne({ interactionId: id }).sort({ seq: -1 }).select("dimensions").lean(),
  ]);
  const answered = new Map<string, number | null>();
  for (const r of interaction?.screenerResponses ?? []) answered.set(r.itemCode, r.skipped || r.value == null ? null : r.value);
  const raw = (latest?.dimensions instanceof Map ? Object.fromEntries(latest.dimensions) : latest?.dimensions) as Record<string, { score?: number }> | undefined;
  const dimensions: Partial<Record<Dimension, number>> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (v?.score != null) dimensions[k as Dimension] = v.score;
  const lang = toVictimLang(interaction?.uiLanguage);
  const items = suggestQuestions({ answered, dimensions, suicideSignal: flowStateOf(interaction?.flowState).suicideSignal }).map((s) => ({
    key: s.key,
    text: t(lang, s.key),
    textEn: t("en", s.key),
    reason: s.reason,
  }));
  return { items };
});
