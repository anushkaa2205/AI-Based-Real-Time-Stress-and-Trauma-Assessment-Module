/**
 * Short answers read with their question (task M.9, FR-NLP-11, AC-NLP-08, gap V7).
 *
 * The module never asks questions (PRODUCT_VISION.md §5). NHAA's chatbot or operator may ask a safety
 * question, which arrives as an OPERATOR turn; the person's next message may be a bare "No" or "हाँ".
 * Alone that means nothing, so the safety lexicon reads it together with the question just before it.
 * Recognised questions (en, hi, Hinglish, mr, ta, bn):
 *  - the four SAFETY questions, by meaning-bearing patterns; a short yes/no answer can fire an override;
 *  - the nine WELLBEING questions (PHQ-2, GAD-2, PC-PTSD-5 wording; decided 16 Nov 2026), by their item
 *    wording in `operatorQuestions.*` plus a few English paraphrases; a short frequency or yes answer is
 *    scored per item (REQUIREMENTS Appendix A). These are rules reading words, not a questionnaire: the
 *    module never asks, and nothing is scored unless NHAA's chatbot or operator actually asked.
 * Only SHORT answers count; longer answers are read by the normal lexicon rules and the AI. Pure: no
 * database, no clock. Like the lexicon, it runs in every consent mode (CLAUDE.md rules 4 and 6), and it
 * can only raise risk: "no" or "not at all" adds nothing (config v3 has no denial scores).
 */
import type { LexiconSignals } from "./engine";
import type { CaseFact, Dimension, OverrideFlag } from "@/core/scoring/types";
import bn from "../../../messages/bn.json";
import en from "../../../messages/en.json";
import hi from "../../../messages/hi.json";
import mr from "../../../messages/mr.json";
import ta from "../../../messages/ta.json";

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
    /(?:near|close to|around) you|nearby|outside your (?:house|home|door)|आपके पास (?:है|हैं)|(?:आपके|तुम्हारे) आसपास|तुमच्या जवळ|जवळपास|அருகில்|কাছাকাছি|আপনার কাছে|(?:aapke|tumhare) paas|aas ?paas/iu,
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

/**
 * Which safety question an operator turn asks, if any. The scripted wording of a wellbeing question is
 * more specific and wins (e.g. the Hindi trauma item mentions "आसपास", "surroundings").
 */
export function safetyQuestionOf(question: string): SafetyQuestion | null {
  if (wellbeingStemOf(question)) return null;
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
 * Signals from a short answer to the safety or wellbeing question asked just before it. The evidence quote is the
 * yes/no word itself, which exists word for word in the person's message.
 */
export function answerSignals(question: string | null | undefined, answer: string): LexiconSignals {
  const none: LexiconSignals = { indicators: [], facts: [], matches: [] };
  if (!question) return none;
  const kind = safetyQuestionOf(question);
  if (!kind) {
    const w = wellbeingQuestionOf(question);
    return w ? { indicators: wellbeingSignals(w, answer), facts: [], matches: [] } : none;
  }
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

// --- wellbeing questions asked in the conversation (task M.9, decided 16 Nov 2026) -------------------

export type WellbeingQuestion = "lowInterest" | "feelingDown" | "nervous" | "cannotStopWorrying" | "badDreams" | "avoidance" | "onGuard" | "numb" | "guilt";

interface WellbeingRule {
  dimension: Dimension;
  answer: "FREQUENCY" | "YES";
  topic: string;
  paraphrase: RegExp;
}

/** PHQ-2 → low mood, GAD-2 → fear/anxiety, PC-PTSD-5 → severe trauma. */
const WELLBEING: Record<WellbeingQuestion, WellbeingRule> = {
  lowInterest: { dimension: "DEPRESSION", answer: "FREQUENCY", topic: "little interest or pleasure", paraphrase: /little interest|no interest|lost interest|pleasure in doing/iu },
  feelingDown: { dimension: "DEPRESSION", answer: "FREQUENCY", topic: "feeling down or hopeless", paraphrase: /feeling (?:down|depressed|hopeless)|down or hopeless/iu },
  nervous: { dimension: "FEAR_ANXIETY", answer: "FREQUENCY", topic: "feeling nervous or worried", paraphrase: /nervous|anxious|on edge/iu },
  cannotStopWorrying: { dimension: "FEAR_ANXIETY", answer: "FREQUENCY", topic: "not being able to stop worrying", paraphrase: /stop worrying|control (?:the |your )?worr/iu },
  badDreams: { dimension: "SEVERE_TRAUMA", answer: "YES", topic: "bad dreams or unwanted thoughts", paraphrase: /bad dreams|nightmares/iu },
  avoidance: { dimension: "SEVERE_TRAUMA", answer: "YES", topic: "avoiding reminders", paraphrase: /tried hard not to think|stayed away from|avoid(?:ed|ing)? (?:things|places|reminders)/iu },
  onGuard: { dimension: "SEVERE_TRAUMA", answer: "YES", topic: "being on guard or easily startled", paraphrase: /on guard|easily startled|watchful/iu },
  numb: { dimension: "SEVERE_TRAUMA", answer: "YES", topic: "feeling numb or cut off", paraphrase: /\bnumb\b|cut off from/iu },
  guilt: { dimension: "SEVERE_TRAUMA", answer: "YES", topic: "guilt or blame", paraphrase: /guilty|blaming yourself/iu },
};
const WELLBEING_CONFIDENCE = 0.75;
/** A "Yes" to one PC-PTSD-5 item: the old positive level (3 of 5). More sensitive than the validated totals. */
const TRAUMA_YES_SCORE = 0.6;

const norm = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();

/** The item wording of each wellbeing question in every language (the part after the prompt's colon). */
const STEMS: [WellbeingQuestion, string][] = (Object.keys(WELLBEING) as WellbeingQuestion[]).flatMap((k) =>
  [en, hi, mr, ta, bn].map((m): [WellbeingQuestion, string] => {
    const full = (m.operatorQuestions as Record<string, string>)[k] ?? "";
    return [k, norm(full.slice(full.lastIndexOf(":") + 1))];
  }),
);

/** The wellbeing question whose scripted item wording (any language) the operator turn contains. */
function wellbeingStemOf(question: string): WellbeingQuestion | null {
  const q = norm(question);
  for (const [k, stem] of STEMS) if (stem && q.includes(stem)) return k;
  return null;
}

/**
 * Which wellbeing question an operator turn asks, if any. Order: scripted wording, then the safety
 * questions (a safety question is never read as a wellbeing one), then English paraphrases.
 */
export function wellbeingQuestionOf(question: string): WellbeingQuestion | null {
  const exact = wellbeingStemOf(question);
  if (exact) return exact;
  if (safetyQuestionOf(question)) return null;
  for (const k of Object.keys(WELLBEING) as WellbeingQuestion[]) if (WELLBEING[k].paraphrase.test(question)) return k;
  return null;
}

/** Frequency labels (the old answer scale in each language, plus common English wording). */
const FREQUENCY: [number, string][] = [
  [3, "nearly every day"],
  [3, "almost every day"],
  [3, "every day"],
  [3, "all the time"],
  [2, "more than half the days"],
  [2, "most days"],
  [1, "several days"],
  [1, "some days"],
  [1, "sometimes"],
  [0, "not at all"],
  [3, "लगभग हर दिन"],
  [3, "हर दिन"],
  [2, "आधे से ज़्यादा दिन"],
  [2, "आधे से ज्यादा दिन"],
  [1, "कुछ दिन"],
  [0, "बिल्कुल नहीं"],
  [3, "lagbhag har din"],
  [3, "har din"],
  [3, "roz"],
  [2, "aadhe se zyada din"],
  [2, "aadhe se jyada din"],
  [1, "kuch din"],
  [0, "bilkul nahi"],
  [3, "जवळजवळ रोज"],
  [3, "रोज"],
  [2, "अर्ध्याहून जास्त दिवस"],
  [1, "काही दिवस"],
  [0, "अजिबात नाही"],
  [3, "கிட்டத்தட்ட ஒவ்வொரு நாளும்"],
  [3, "ஒவ்வொரு நாளும்"],
  [2, "பாதி நாட்களுக்கு மேல்"],
  [1, "சில நாட்கள்"],
  [0, "இல்லவே இல்லை"],
  [3, "প্রায় প্রতিদিন"],
  [3, "প্রতিদিন"],
  [2, "অর্ধেকের বেশি দিন"],
  [1, "কয়েক দিন"],
  [0, "একেবারেই না"],
];
const FREQUENCY_NAMES = ["not at all", "several days", "more than half the days", "nearly every day"];

/** The frequency a short answer starts with (0–3) and where it is in the answer; null otherwise. */
export function frequencyOf(answer: string): { value: number; start: number; end: number } | null {
  const words = [...answer.matchAll(WORD)];
  if (!words.length || words.length > MAX_WORDS + 2) return null;
  const a = norm(answer);
  for (const [value, label] of FREQUENCY) {
    const l = norm(label);
    if (a !== l && !a.startsWith(`${l} `)) continue;
    // Evidence: the label as written when it is there word for word; otherwise the whole answer.
    const i = answer.toLowerCase().indexOf(label.toLowerCase());
    if (i >= 0) return { value, start: i, end: i + label.length };
    const trimmed = answer.trim();
    const t = answer.indexOf(trimmed);
    return { value, start: t, end: t + trimmed.length };
  }
  return null;
}

function wellbeingSignals(kind: WellbeingQuestion, answer: string): LexiconSignals["indicators"] {
  const rule = WELLBEING[kind];
  let score: number;
  let span: { start: number; end: number };
  let said: string;
  if (rule.answer === "FREQUENCY") {
    const f = frequencyOf(answer);
    if (!f || f.value === 0) return [];
    score = Math.round((f.value / 3) * 100) / 100;
    span = f;
    said = FREQUENCY_NAMES[f.value]!;
  } else {
    const p = polarityOf(answer);
    if (!p || p.polarity !== "YES") return [];
    score = TRAUMA_YES_SCORE;
    span = p;
    said = "yes";
  }
  return [
    {
      id: `answer:${kind}:${span.start}`,
      ruleId: `ANSWER-${kind}`,
      dimension: rule.dimension,
      source: "SAFETY_LEXICON",
      score,
      confidence: WELLBEING_CONFIDENCE,
      negated: false,
      label: `Answered "${said}" when asked about ${rule.topic}`,
      evidence: { start: span.start, end: span.end, quote: answer.slice(span.start, span.end) },
    },
  ];
}
