/**
 * Supported victim languages (task 8.1, FR-LANG-01/04). To add a language: add its code to
 * VICTIM_LANGS (contracts/victim.ts), a `messages/<code>.json` with every key (checked by
 * `npm run i18n:check`), its import in core/i18n/messages.ts, and one line here. Speech-to-text
 * routing is by language code in the analysis service (Whisper for hi/en, IndicConformer for
 * the others), so no model code changes are needed for languages IndicConformer covers.
 */
import type { VictimLang } from "@/contracts/victim";

export const LANGUAGE_INFO: Record<VictimLang, { label: string; speech: string }> = {
  en: { label: "English", speech: "en-IN" },
  hi: { label: "हिंदी", speech: "hi-IN" },
  mr: { label: "मराठी", speech: "mr-IN" },
  ta: { label: "தமிழ்", speech: "ta-IN" },
  bn: { label: "বাংলা", speech: "bn-IN" },
};
