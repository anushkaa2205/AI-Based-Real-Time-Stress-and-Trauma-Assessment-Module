/**
 * `npm run i18n:check` (task 3.8, AC-LANG-01): fails if any language is missing
 * a key that another language has. Prints key names only.
 */
import { MESSAGES, leafKeys } from "@/core/i18n/messages";

export function missingKeys(): Record<string, string[]> {
  const all = new Set(Object.values(MESSAGES).flatMap((m) => leafKeys(m)));
  const out: Record<string, string[]> = {};
  for (const [lang, m] of Object.entries(MESSAGES)) {
    const have = new Set(leafKeys(m));
    const missing = [...all].filter((k) => !have.has(k)).sort();
    if (missing.length) out[lang] = missing;
  }
  return out;
}

const missing = missingKeys();
const langs = Object.keys(MESSAGES).join(", ");
if (Object.keys(missing).length) {
  for (const [lang, keys] of Object.entries(missing)) console.error(`${lang} is missing ${keys.length} key(s):\n  ${keys.join("\n  ")}`);
  process.exit(1);
} else {
  console.log(`i18n ok: every key exists in ${langs}`);
}
