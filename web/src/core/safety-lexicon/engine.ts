/**
 * Rule-based safety lexicon (task 2.8, FR-NLP-10, FR-NLP-08, NFR-PERF-04).
 * The first of the two independent safety paths (CLAUDE.md rule 4): it runs
 * in-process on every message, in every consent mode, whether or not the AI
 * service is up. Pure and synchronous.
 *
 * - Every rule set runs on every message (Hindi text often contains English or
 *   Romanised words), so a wrong language hint cannot hide a match.
 * - Matching is done on the ORIGINAL text, so each quote is exactly
 *   text.slice(start, end) (CLAUDE.md rule 12).
 * - Negation: a cue word in the same clause, within `before` words ahead of the
 *   match (or `after` words behind it, for Hindi/Hinglish where "nahi" follows
 *   the verb), marks the match negated. Negated matches are kept for audit but
 *   not scored (FR-NLP-08). Negation words inside a pattern are part of the
 *   phrase ("जीना नहीं चाहती" = "I don't want to live") and do not negate it.
 */
import { z } from "zod";
import { DIMENSIONS } from "@/models/enums";
import { CASE_FACTS, OVERRIDE_FLAGS, type CaseFact, type IndicatorInput, type OverrideFlag } from "@/core/scoring/types";
import en from "./rules/en.json";
import hi from "./rules/hi.json";
import bn from "./rules/bn.json";
import hinglish from "./rules/hinglish.json";
import mr from "./rules/mr.json";
import ta from "./rules/ta.json";

const RuleSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    patterns: z.array(z.string().min(1)).min(1),
    dimension: z.enum(DIMENSIONS).optional(),
    score: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    flags: z.array(z.enum(OVERRIDE_FLAGS)).optional(),
    fact: z.enum(CASE_FACTS).optional(),
  })
  .refine((r) => (r.dimension ? r.score !== undefined && r.confidence !== undefined : !!r.fact), {
    message: "a rule needs dimension + score + confidence, or a fact",
  });

export const RuleSetSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  negation: z.object({
    cues: z.array(z.string().min(1)).min(1),
    before: z.number().int().min(0).max(6),
    after: z.number().int().min(0).max(6),
  }),
  /** Words that start a new clause (in addition to punctuation) */
  clauseBreaks: z.array(z.string().min(1)),
  rules: z.array(RuleSchema).min(1),
});
export type RuleSet = z.infer<typeof RuleSetSchema>;

export interface LexiconMatch {
  ruleId: string;
  ruleSet: string;
  label: string;
  dimension?: IndicatorInput["dimension"];
  score?: number;
  confidence?: number;
  flags: OverrideFlag[];
  fact?: CaseFact;
  start: number;
  end: number;
  quote: string;
  negated: boolean;
}

interface CompiledRule {
  rule: RuleSet["rules"][number];
  regexes: RegExp[];
}
interface CompiledSet {
  set: RuleSet;
  rules: CompiledRule[];
  cues: Set<string>;
  breaks: Set<string>;
}

// Unicode-aware word edges (\b does not work for Devanagari).
const EDGE_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}])";
const EDGE_AFTER = "(?![\\p{L}\\p{M}\\p{N}])";
const CLAUSE_PUNCT = /[.!?।॥,;:\n()]/u;
const TOKEN = /[\p{L}\p{M}\p{N}'’]+/gu;

const norm = (w: string) => w.toLowerCase().replace(/’/g, "'");

export function compile(raw: unknown): CompiledSet {
  const set = RuleSetSchema.parse(raw);
  return {
    set,
    rules: set.rules.map((rule) => ({
      rule,
      regexes: rule.patterns.map((p) => new RegExp(`${EDGE_BEFORE}(?:${p})${EDGE_AFTER}`, "giu")),
    })),
    cues: new Set(set.negation.cues.map(norm)),
    breaks: new Set(set.clauseBreaks.map(norm)),
  };
}

const DEFAULT_SETS: readonly CompiledSet[] = [compile(en), compile(hi), compile(hinglish), compile(mr), compile(ta), compile(bn)];

export const LEXICON_VERSION = DEFAULT_SETS.map((s) => s.set.version).join("+");

/** Words of the clause around a match, nearest first. */
function clauseWords(text: string, from: number, to: number, direction: "before" | "after", breaks: Set<string>): string[] {
  const segment = direction === "before" ? text.slice(from, to) : text.slice(from, to);
  // Cut at punctuation nearest to the match
  let cut = segment;
  if (direction === "before") {
    const parts = cut.split(CLAUSE_PUNCT);
    cut = parts[parts.length - 1] ?? "";
  } else {
    cut = cut.split(CLAUSE_PUNCT)[0] ?? "";
  }
  const words = (cut.match(TOKEN) ?? []).map(norm);
  const ordered = direction === "before" ? words.reverse() : words;
  const out: string[] = [];
  for (const w of ordered) {
    if (breaks.has(w)) break;
    out.push(w);
  }
  return out;
}

function isNegated(text: string, start: number, end: number, c: CompiledSet): boolean {
  const { before, after } = c.set.negation;
  const lookBehind = clauseWords(text, Math.max(0, start - 200), start, "before", c.breaks).slice(0, before);
  if (lookBehind.some((w) => c.cues.has(w))) return true;
  if (after > 0) {
    const lookAhead = clauseWords(text, end, Math.min(text.length, end + 200), "after", c.breaks).slice(0, after);
    if (lookAhead.some((w) => c.cues.has(w))) return true;
  }
  return false;
}

export function scan(text: string, sets: readonly CompiledSet[] = DEFAULT_SETS): LexiconMatch[] {
  const out: LexiconMatch[] = [];
  const seen = new Set<string>();
  for (const c of sets) {
    for (const { rule, regexes } of c.rules) {
      for (const re of regexes) {
        re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
          const start = m.index;
          const end = start + m[0].length;
          const key = `${c.set.id}:${rule.id}:${start}:${end}`;
          if (m[0].length === 0 || seen.has(key)) continue;
          seen.add(key);
          out.push({
            ruleId: rule.id,
            ruleSet: c.set.id,
            label: rule.label,
            ...(rule.dimension ? { dimension: rule.dimension, score: rule.score, confidence: rule.confidence } : {}),
            flags: rule.flags ?? [],
            ...(rule.fact ? { fact: rule.fact } : {}),
            start,
            end,
            quote: m[0],
            negated: isNegated(text, start, end, c),
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end || a.ruleId.localeCompare(b.ruleId, "en"));
}

export interface LexiconSignals {
  indicators: (IndicatorInput & { evidence: { start: number; end: number; quote: string }; ruleId: string })[];
  facts: CaseFact[];
  matches: LexiconMatch[];
}

/** Matches as SAFETY_LEXICON indicators (negated ones kept, flagged) plus non-negated facts. */
export function lexiconSignals(text: string, sets?: readonly CompiledSet[]): LexiconSignals {
  const matches = scan(text, sets);
  const indicators: LexiconSignals["indicators"] = [];
  const facts = new Set<CaseFact>();
  for (const m of matches) {
    if (m.fact && !m.negated) facts.add(m.fact);
    if (!m.dimension || m.score === undefined || m.confidence === undefined) continue;
    indicators.push({
      id: `lexicon:${m.ruleSet}:${m.ruleId}:${m.start}`,
      ruleId: m.ruleId,
      dimension: m.dimension,
      source: "SAFETY_LEXICON",
      score: m.score,
      confidence: m.confidence,
      negated: m.negated,
      label: m.label,
      ...(m.flags.length ? { flags: m.flags } : {}),
      evidence: { start: m.start, end: m.end, quote: m.quote },
    });
  }
  return { indicators, facts: [...facts].sort(), matches };
}
