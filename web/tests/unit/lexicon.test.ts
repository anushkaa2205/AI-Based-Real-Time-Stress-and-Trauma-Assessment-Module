/** Safety lexicon (task 2.8). All sentences are synthetic, respectful and non-graphic (rule 11). */
import { describe, expect, it } from "vitest";
import { LEXICON_VERSION, RuleSetSchema, compile, lexiconSignals, scan } from "@/core/safety-lexicon/engine";
import en from "@/core/safety-lexicon/rules/en.json";
import hi from "@/core/safety-lexicon/rules/hi.json";
import hinglish from "@/core/safety-lexicon/rules/hinglish.json";

/** Active (non-negated) rule ids found in a text */
const active = (text: string) => scan(text).filter((m) => !m.negated).map((m) => m.ruleId);
const negatedIds = (text: string) => scan(text).filter((m) => m.negated).map((m) => m.ruleId);
const flagsOf = (text: string) => new Set(lexiconSignals(text).indicators.filter((i) => !i.negated).flatMap((i) => i.flags ?? []));

describe("rule files", () => {
  it.each([en, hi, hinglish])("$id is valid and compiles", (set) => {
    expect(RuleSetSchema.safeParse(set).success).toBe(true);
    expect(() => compile(set)).not.toThrow();
  });

  it("rule ids are unique across all files", () => {
    const ids = [en, hi, hinglish].flatMap((s) => s.rules.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports a version", () => {
    expect(LEXICON_VERSION).toBe("en-1.0+hi-1.0+hinglish-1.0");
  });
});

describe("English", () => {
  it.each([
    ["I am going to end my life tonight", "SUICIDAL_INTENT"],
    ["I want to die", "PASSIVE_SUICIDAL_IDEATION"],
    ["Sometimes I wish I was dead", "PASSIVE_SUICIDAL_IDEATION"],
    ["My family would be better off without me", "PASSIVE_SUICIDAL_IDEATION"],
    ["I don't want to live anymore", "PASSIVE_SUICIDAL_IDEATION"],
    ["They are standing outside my house right now", "ACCUSED_PRESENT"],
    ["They locked me inside the room", "CONFINED"],
    ["I am bleeding and need a doctor now", "SERIOUS_INJURY"],
    ["They threatened to kill my son", "THREAT_TO_LIFE"],
    ["They keep telling me to withdraw the complaint", "PRESSURE_TO_WITHDRAW"],
    ["We were forced out of the village", "DISPLACED"],
  ])("%j → %s", (text, flag) => {
    expect(flagsOf(text).has(flag as never)).toBe(true);
  });

  it.each([
    "I would never hurt myself",
    "I don't want to die",
    "I am not thinking about suicide",
    "I will not kill myself",
  ])("negation: %j is not counted", (text) => {
    expect(active(text).filter((id) => id.startsWith("EN-SI") || id.startsWith("EN-SELFHARM"))).toEqual([]);
  });

  it("negation stays inside its clause", () => {
    expect(active("I don't know what to do and I want to die")).toContain("EN-SI-EXPLICIT-1");
    expect(active("I am not sure, but I want to die")).toContain("EN-SI-EXPLICIT-1");
  });

  it.each(["The weather is nice today", "My son goes to school", "We went to the market to buy rice"])(
    "no false alarm on %j",
    (text) => {
      expect(scan(text)).toEqual([]);
    },
  );

  it("detects isolation, boycott and legal-aid facts", () => {
    expect(active("Our family has been boycotted by the village")).toContain("EN-ISOLATION-BOYCOTT-1");
    expect(lexiconSignals("The police refused to register my complaint").facts).toContain("COMPLAINT_NOT_REGISTERED");
    expect(lexiconSignals("I don't know my rights").facts).toContain("RIGHTS_CONFUSION");
    expect(lexiconSignals("The case has been pending for 6 years").facts).toContain("LONG_RUNNING_CASE");
    expect(lexiconSignals("The witnesses were threatened last week").facts).toContain("WITNESS_UNDER_THREAT");
  });
});

describe("Hindi", () => {
  it.each([
    ["मैं आज ही जान दे दूँगी", "SUICIDAL_INTENT"],
    ["मैं मरना चाहती हूँ", "PASSIVE_SUICIDAL_IDEATION"],
    ["अब जीने का कोई मतलब नहीं है", "PASSIVE_SUICIDAL_IDEATION"],
    ["मुझे जीना नहीं है", "PASSIVE_SUICIDAL_IDEATION"],
    ["वो लोग घर के बाहर खड़े हैं", "ACCUSED_PRESENT"],
    ["उन्होंने मुझे कमरे में बंद कर दिया", "CONFINED"],
    ["जान से मार देंगे बोल रहे थे", "THREAT_TO_LIFE"],
    ["कह रहे हैं केस वापस लो", "PRESSURE_TO_WITHDRAW"],
    ["हमें गाँव से निकाल दिया", "DISPLACED"],
  ])("%j → %s", (text, flag) => {
    expect(flagsOf(text).has(flag as never)).toBe(true);
  });

  it.each(["मैं मरना नहीं चाहती", "मैं खुद को कभी नुकसान नहीं पहुँचाऊँगी"])("negation: %j is not counted", (text) => {
    expect(active(text).filter((id) => id.startsWith("HI-SI") || id.startsWith("HI-SELFHARM"))).toEqual([]);
  });

  it("keeps the negated match for audit (FR-NLP-08)", () => {
    expect(negatedIds("मैं खुद को कभी नुकसान नहीं पहुँचाऊँगी")).toContain("HI-SELFHARM-1");
  });

  it("detects boycott and complaint-not-registered", () => {
    expect(active("हमारा बहिष्कार कर दिया गया है")).toContain("HI-ISOLATION-BOYCOTT-1");
    expect(lexiconSignals("पुलिस ने शिकायत नहीं ली").facts).toContain("COMPLAINT_NOT_REGISTERED");
  });

  it("no false alarm on everyday text", () => {
    expect(scan("आज बाज़ार से सब्ज़ी लाई")).toEqual([]);
  });
});

describe("Hinglish (Romanised Hindi)", () => {
  it.each([
    ["aaj hi jaan de dungi", "SUICIDAL_INTENT"],
    ["main marna chahti hoon", "PASSIVE_SUICIDAL_IDEATION"],
    ["ab jeene ka koi matlab nahi", "PASSIVE_SUICIDAL_IDEATION"],
    ["wo log ghar ke bahar khade hain", "ACCUSED_PRESENT"],
    ["mujhe kamre mein band kar diya", "CONFINED"],
    ["jaan se maar denge bol rahe hain", "THREAT_TO_LIFE"],
    ["bol rahe hain case wapas lo", "PRESSURE_TO_WITHDRAW"],
    ["hume gaon se nikal diya", "DISPLACED"],
  ])("%j → %s", (text, flag) => {
    expect(flagsOf(text).has(flag as never)).toBe(true);
  });

  it.each([
    ["case wapas lo", "case wapis lo", "case vapas le lo"],
    ["marna chahti", "marna chahta", "marna chahte"],
  ])("tolerates spelling variants: %j / %j / %j", (...variants) => {
    const ids = variants.map((v) => active(v).sort().join());
    expect(ids[0]).not.toBe("");
    expect(new Set(ids).size).toBe(1);
  });

  it("negation: 'main kabhi khud ko hurt nahi karungi' is not counted", () => {
    expect(active("main kabhi khud ko hurt nahi karungi").filter((id) => id.includes("SELFHARM"))).toEqual([]);
    expect(negatedIds("main kabhi khud ko hurt nahi karungi")).toContain("HL-SELFHARM-1");
  });

  it("detects complaint not registered", () => {
    expect(lexiconSignals("police ne FIR nahi likhi").facts).toContain("COMPLAINT_NOT_REGISTERED");
  });
});

describe("spans and output", () => {
  it("every quote is exactly text.slice(start, end) (CLAUDE.md rule 12)", () => {
    const texts = [
      "वो लोग घर के बाहर खड़े हैं, कह रहे हैं केस वापस लो",
      "They are standing outside my house right now and said they will kill my family",
      "mujhe ab jeena nahi hai, aaj hi jaan de dungi",
    ];
    for (const text of texts) {
      const matches = scan(text);
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) expect(text.slice(m.start, m.end)).toBe(m.quote);
    }
  });

  it("produces SAFETY_LEXICON indicators with evidence", () => {
    const { indicators } = lexiconSignals("I want to die");
    expect(indicators[0]).toMatchObject({
      source: "SAFETY_LEXICON",
      dimension: "SUICIDAL_IDEATION",
      negated: false,
      evidence: { quote: "want to die", start: 2, end: 13 },
    });
  });

  it("does not report facts from negated matches", () => {
    expect(lexiconSignals("I do know my rights").facts).toEqual([]);
  });
});

describe("performance (NFR-PERF-04)", () => {
  it("scans a 2,000-character message in under 50 ms", () => {
    const text = (
      "They came again yesterday, वो लोग घर के बाहर खड़े हैं, bol rahe hain case wapas lo. I feel scared and alone. "
    ).repeat(20).slice(0, 2000);
    scan(text); // warm-up (regex compilation is already cached)
    const runs = 20;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) scan(text);
    const perMessage = (performance.now() - t0) / runs;
    expect(perMessage).toBeLessThan(50);
  });
});
