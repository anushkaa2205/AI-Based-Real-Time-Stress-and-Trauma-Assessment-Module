/**
 * Translated text the module returns or shows, loaded from messages/*.json (CLAUDE.md: never
 * hard-coded): the emergency options for calling systems and the operator's suggested questions.
 * Server code translates with `t(lang, key)`.
 */
import { createTranslator } from "next-intl";
import type { VictimLang } from "@/contracts/interaction";
import en from "../../../messages/en.json";
import bn from "../../../messages/bn.json";
import hi from "../../../messages/hi.json";
import mr from "../../../messages/mr.json";
import ta from "../../../messages/ta.json";

export type Messages = typeof en;

export const MESSAGES: Record<VictimLang, Messages> = { en, hi, mr, ta, bn };

const translators = {
  en: createTranslator({ locale: "en", messages: en }),
  hi: createTranslator({ locale: "hi", messages: hi }),
  mr: createTranslator({ locale: "mr", messages: mr }),
  ta: createTranslator({ locale: "ta", messages: ta }),
  bn: createTranslator({ locale: "bn", messages: bn }),
};

/** Translate a dotted key, e.g. t("hi", "operatorQuestions.safeNow"). */
export function t(lang: VictimLang, key: string): string {
  // Keys are built at run time (suggested questions), so the typed key check cannot apply here.
  return (translators[lang] as unknown as (k: string) => string)(key);
}

export function hasKey(lang: VictimLang, key: string): boolean {
  let node: unknown = MESSAGES[lang];
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

/** Every leaf key ("a.b.c") of a messages object. */
export function leafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}
