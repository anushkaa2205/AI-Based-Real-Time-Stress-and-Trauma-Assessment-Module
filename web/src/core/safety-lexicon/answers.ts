/**
 * Short answers read with their question (task M.9, FR-NLP-11, AC-NLP-08, gap V7).
 *
 * The module never asks questions (PRODUCT_VISION.md §5). NHAA's chatbot or operator may ask a safety
 * question, which arrives as an OPERATOR turn; the person's next message may be a bare "No" or "हाँ".
 * Alone that means nothing, so the safety lexicon reads it together with the question just before it.
 * Only the four safety questions are recognised, in en, hi, Hinglish, mr, ta and bn, by meaning-bearing
 * patterns (not exact wording). Only SHORT answers that start with a yes/no word count; longer answers
 * are read by the normal lexicon rules. Pure: no database, no clock. Like the lexicon, it runs in every
 * consent mode (CLAUDE.md rules 4 and 6), and it can only raise risk: a "no" to a suicide question adds
 * nothing (config v3 has no denial scores).
 */
import type { LexiconSignals } from "./engine";
import type { CaseFact, OverrideFlag } from "@/core/scoring/types";

export type SafetyQuestion = "SUICIDAL_INTENT" | "SUICIDAL_THOUGHTS" | "ACCUSED_NEARBY" | "SAFE_NOW";

/** Checked in this order: the intent question also mentions "these thoughts". */
const QUESTION_PATTERNS: [SafetyQuestion, RegExp][] = [
  [
    "SUICIDAL_INTENT",
    /act(?:ing)? on (?:these|those|the|them|it)|made a plan|have a plan|planned how|अमल|योजना|कृती|செயல்பட|திட்டம்|কিছু করার কথা|পরিকল্পনা|\bamal\b|plan (?:bana|kiya|hai)/iu,
  ],
  [
    "SUICIDAL_THOUGHTS",
    /end(?:ing)? your (?:own )?life|tak(?:e|ing) your (?:own )?life|kill(?:ing)? yourself|suicid|जान लेने|आत्महत्या|आयुष्य संपवण्या|जीव देण्या|உயிரை முடித்து|தற்கொலை|জীবন শেষ|আত্মহত্যা|jaan (?:lene|dene)|khudkushi|marne ka (?:vichar|khayal)/iu,
  ],
  [
    "ACCUSED_NEARBY",
    /(?:near|close to|around) you|nearby|outside your (?:house|home|door)|आपके पास (?:है|हैं)|आसपास|तुमच्या जवळ|जवळपास|அருகில்|কাছাকাছি|আপনার কাছে|(?:aapke|tumhare) paas|aas ?paas/iu,
  ],
  [
    "SAFE_NOW",
    /are you (?:feeling |in a )?safe|(?:do|can) you feel safe|you safe (?:right )?now|सुरक्षित (?:जगह पर )?हैं|सुरक्षित महसूस|सुरक्षित (?:ठिकाणी )?आहात|सुरक्षित वाटत|பாதுகாப்பான இடத்தில் இருக்கிறீர்களா|பாதுகாப்பாக (?:இருக்கிறீர்களா|உணர)|নিরাপদ (?:জায়গায় )?আছেন|নিরাপদ বোধ|(?:aap|tum)\b.{0,15}\b(?:safe|surakshit) (?:ho|hain|hai)/iu,
  ],
];

const YES = new Set(["yes", "yeah", "yep", "yup", "yea", "ya", "haan", "haa", "ha", "han", "हाँ", "हां", "हा", "हो", "होय", "ஆம்", "ஆமாம்", "ஆமா", "হ্যাঁ", "হ্যা", "হাঁ"]);
const NO = new Set(["no", "nope", "nah", "not", "never", "nahi", "nahin", "nai", "nhi", "na", "नहीं", "नही", "ना", "न", "नाही", "नको", "இல்லை", "இல்ல", "கிடையாது", "না", "নাহ", "নেই"]);
const POLITE = new Set(["ji", "जी", "sir", "madam"]);
/** "Short" = at most this many words; anything longer is read by the normal lexicon rules. */
const MAX_WORDS = 6;
const CONFIDENCE = 0.85;

const WORD = /[\p{L}\p{M}\p{N}'’]+/gu;

/** Which safety question an operator turn asks, if any. */
export function safetyQuestionOf(question: string): SafetyQuestion | null {
  for (const [kind, re] of QUESTION_PATTERNS) if (re.test(question)) return kind;
  return null;
}

/** "YES" / "NO" for a short answer that starts with one of those words; null otherwise. */
export function polarityOf(answer: string): { polarity: "YES" | "NO"; start: number; end: number } | null {
  const words = [...answer.matchAll(WORD)];
  if (!words.length || words.length > MAX_WORDS) return null;
  for (const w of words.slice(0, 2)) {
    const t = w[0].toLowerCase();
    if (YES.has(t)) return { polarity: "YES", start: w.index, end: w.index + w[0].length };
    if (NO.has(t)) return { polarity: "NO", start: w.index, end: w.index + w[0].length };
    if (!POLITE.has(t)) return null; // only a polite word ("जी", "ji") may come before yes/no
  }
  return null;
}

interface AnswerRule {
  when: "YES" | "NO";
  dimension: "FEAR_ANXIETY" | "INTIMIDATION" | "SUICIDAL_IDEATION";
  score: number;
  flags: OverrideFlag[];
  fact?: CaseFact;
  label: string;
}

/** Same meaning as the old structured safety check (REQUIREMENTS Appendix B). */
const RULES: Record<SafetyQuestion, AnswerRule> = {
  SAFE_NOW: { when: "NO", dimension: "FEAR_ANXIETY", score: 0.8, flags: ["NOT_SAFE_NOW"], fact: "NOT_SAFE_NOW", label: "Answered no when asked if safe right now" },
  ACCUSED_NEARBY: { when: "YES", dimension: "INTIMIDATION", score: 0.9, flags: ["ACCUSED_PRESENT"], label: "Answered yes when asked if the accused is nearby now" },
  SUICIDAL_THOUGHTS: { when: "YES", dimension: "SUICIDAL_IDEATION", score: 0.6, flags: ["PASSIVE_SUICIDAL_IDEATION"], label: "Answered yes when asked about thoughts of ending life" },
  SUICIDAL_INTENT: { when: "YES", dimension: "SUICIDAL_IDEATION", score: 1, flags: ["SUICIDAL_INTENT"], label: "Answered yes when asked about intent or a plan to end life" },
};

/**
 * Signals from a short answer to the safety question asked just before it. The evidence quote is the
 * yes/no word itself, which exists word for word in the person's message.
 */
export function answerSignals(question: string | null | undefined, answer: string): LexiconSignals {
  const none: LexiconSignals = { indicators: [], facts: [], matches: [] };
  if (!question) return none;
  const kind = safetyQuestionOf(question);
  if (!kind) return none;
  const p = polarityOf(answer);
  const rule = RULES[kind];
  if (!p || p.polarity !== rule.when) return none;
  return {
    indicators: [
      {
        id: `answer:${kind}:${p.start}`,
        ruleId: `ANSWER-${kind}`,
        dimension: rule.dimension,
        source: "SAFETY_LEXICON",
        score: rule.score,
        confidence: CONFIDENCE,
        negated: false,
        label: rule.label,
        flags: rule.flags,
        evidence: { start: p.start, end: p.end, quote: answer.slice(p.start, p.end) },
      },
    ],
    facts: rule.fact ? [rule.fact] : [],
    matches: [],
  };
}

/** Lexicon signals of a message plus those of the answer it gives to the previous question. */
export function mergeSignals(a: LexiconSignals, b: LexiconSignals): LexiconSignals {
  return { indicators: [...a.indicators, ...b.indicators], facts: [...new Set([...a.facts, ...b.facts])].sort(), matches: [...a.matches, ...b.matches] };
}

/** For a conversation, the operator turn just before each of the person's turns (null if none). */
export function withPreviousQuestion(turns: readonly { sender: "VICTIM" | "OPERATOR"; text: string }[]): { text: string; question: string | null }[] {
  const out: { text: string; question: string | null }[] = [];
  let previous: { sender: string; text: string } | null = null;
  for (const t of turns) {
    if (t.sender === "VICTIM") out.push({ text: t.text, question: previous?.sender === "OPERATOR" ? previous.text : null });
    previous = t;
  }
  return out;
}
