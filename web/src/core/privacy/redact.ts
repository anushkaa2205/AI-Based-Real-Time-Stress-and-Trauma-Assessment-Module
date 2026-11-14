/**
 * PII redaction before any external AI call (task 1.4, NFR-SEC-05, AC-SEC-02).
 * Pure: text in, redacted text + replaced spans out. No I/O, no logging.
 *
 * Detects phone numbers, e-mail addresses, 12-digit ID numbers (Aadhaar-like),
 * 6-digit PIN codes, and names/addresses supplied from context. Handles ASCII
 * and Devanagari digits. When unsure it redacts (privacy over recall).
 */

export type PiiType = "ADDRESS" | "NAME" | "EMAIL" | "ID_NUMBER" | "PHONE" | "PIN_CODE";

export const PII_PLACEHOLDER: Record<PiiType, string> = {
  ADDRESS: "[ADDRESS]",
  NAME: "[NAME]",
  EMAIL: "[EMAIL]",
  ID_NUMBER: "[ID]",
  PHONE: "[PHONE]",
  PIN_CODE: "[PIN]",
};

export interface RedactionContext {
  /** Full names known for this case (victim, family, accused), e.g. from the PII vault */
  names?: readonly string[];
  /** Addresses known for this case */
  addresses?: readonly string[];
}

/** A replaced span, with offsets into the ORIGINAL text. */
export interface Redaction {
  type: PiiType;
  start: number;
  end: number;
}

export interface RedactionResult {
  text: string;
  redactions: Redaction[];
}

// ASCII and Devanagari digits
const D = "[0-9०-९]";
const NOT_D_BEFORE = `(?<!${D})`;
const NOT_D_AFTER = `(?!${D})`;
const SEP = "[\\s\\-.]?";

const PATTERNS: readonly (readonly [PiiType, RegExp])[] = [
  ["EMAIL", /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu],
  // 12-digit identity number, optionally grouped 4-4-4
  // (not after "+", which starts an international phone number like +919876543210)
  ["ID_NUMBER", new RegExp(`(?<!\\+)${NOT_D_BEFORE}${D}{4}${SEP}${D}{4}${SEP}${D}{4}${NOT_D_AFTER}`, "gu")],
  // Indian mobile: optional +91 / 0091 / 91 / 0 prefix, 10 digits starting 6-9, optional split 5+5
  [
    "PHONE",
    new RegExp(
      `${NOT_D_BEFORE}(?:(?:\\+|00)?(?:91|९१)[\\s\\-]?|0|०)?[6-9६-९]${D}{4}${SEP}${D}{5}${NOT_D_AFTER}`,
      "gu",
    ),
  ],
  // Landline with STD code, e.g. 011-23456789, 0712 2345678
  ["PHONE", new RegExp(`${NOT_D_BEFORE}[0०]${D}{2,4}[\\s\\-]${D}{6,8}${NOT_D_AFTER}`, "gu")],
  // PIN code: 6 digits, first non-zero, optionally "110 001"
  ["PIN_CODE", new RegExp(`${NOT_D_BEFORE}[1-9१-९]${D}{2}\\s?${D}{3}${NOT_D_AFTER}`, "gu")],
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive matcher that also works for Indic scripts (no \b). */
function phraseRegExp(phrase: string): RegExp {
  const body = escapeRegExp(phrase.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${body}(?![\\p{L}\\p{M}\\p{N}])`, "giu");
}

const MIN_PART = 3;

/** Phrases to look for: full strings first, then their parts (names: words; addresses: comma parts). */
function contextPhrases(ctx: RedactionContext): (readonly [PiiType, string])[] {
  const out: (readonly [PiiType, string])[] = [];
  const add = (type: PiiType, s: string) => {
    const t = s.trim();
    if (t.length >= MIN_PART) out.push([type, t]);
  };
  for (const a of ctx.addresses ?? []) {
    add("ADDRESS", a);
    for (const part of a.split(/[,\n;]/)) if (part.trim().length >= 4) add("ADDRESS", part);
  }
  for (const n of ctx.names ?? []) {
    add("NAME", n);
    for (const part of n.split(/\s+/)) add("NAME", part);
  }
  // Longest first, so "Asha Devi" wins over "Asha"
  return out.sort((x, y) => y[1].length - x[1].length);
}

export function redact(text: string, ctx: RedactionContext = {}): RedactionResult {
  const found: Redaction[] = [];
  const overlaps = (s: number, e: number) => found.some((r) => s < r.end && e > r.start);
  const collect = (type: PiiType, re: RegExp) => {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length > 0 && !overlaps(start, end)) found.push({ type, start, end });
    }
  };

  // Context first: a known address may contain a PIN code or a name.
  for (const [type, phrase] of contextPhrases(ctx)) collect(type, phraseRegExp(phrase));
  for (const [type, re] of PATTERNS) collect(type, re);

  found.sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const r of found) {
    out += text.slice(pos, r.start) + PII_PLACEHOLDER[r.type];
    pos = r.end;
  }
  out += text.slice(pos);
  return { text: out, redactions: found };
}
