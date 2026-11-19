/**
 * GET /api/v1/staff/interactions/{id}/suggested-questions (API_CONTRACTS §5.3, FR-CH-04, FR-DSH-01).
 * Scripted questions only (rule 2) for the operator to ask aloud, in the caller's language with
 * English alongside. There are no structured answers (PRODUCT_VISION §5); the answers arrive as speech.
 * Questions already asked in the interaction are not suggested again (P.3).
 */
import { toVictimLang } from "@/contracts/interaction";
import { loadInteractionResource } from "@/core/cases/resource";
import { t } from "@/core/i18n/messages";
import { loadQuestionInput } from "@/core/operator/load";
import { suggestQuestions } from "@/core/operator/suggest";
import { route } from "@/lib/route";
import { Interaction } from "@/models";

export const GET = route({ auth: "staff", action: "case.read" }, async ({ params, authorize }) => {
  const id = String(params.id);
  const { resource } = await loadInteractionResource(id);
  authorize("case.read", resource);
  const interaction = await Interaction.findById(id).select("uiLanguage").lean();
  const lang = toVictimLang(interaction?.uiLanguage);
  const items = suggestQuestions(await loadQuestionInput(id)).map((s) => ({
    key: s.key,
    text: t(lang, s.key),
    textEn: t("en", s.key),
    reason: s.reason,
  }));
  return { items };
});
