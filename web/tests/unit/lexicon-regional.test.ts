/**
 * Safety lexicon for Marathi, Tamil and Bengali (task 8.1, FR-LANG-01/02, rule 4).
 * Synthetic, non-graphic sentences. The rule files are drafts pending native-speaker review;
 * these tests pin the safety-critical behaviour so a revision cannot silently lose it.
 */
import { describe, expect, it } from "vitest";
import { LEXICON_VERSION, lexiconSignals } from "@/core/safety-lexicon/engine";

const flagsOf = (text: string) => lexiconSignals(text).indicators.filter((i) => !i.negated).flatMap((i) => i.flags ?? []);
const activeDims = (text: string) => lexiconSignals(text).indicators.filter((i) => !i.negated).map((i) => i.dimension);

const CASES: Record<string, { text: string; flag?: string; dim: string }[]> = {
  mr: [
    { text: "ते लोक आत्ता इथे आहेत, मला भीती वाटते", flag: "ACCUSED_PRESENT", dim: "INTIMIDATION" },
    { text: "मी आज जीव देणार आहे", flag: "SUICIDAL_INTENT", dim: "SUICIDAL_IDEATION" },
    { text: "त्यांनी जीवे मारण्याची धमकी दिली", flag: "THREAT_TO_LIFE", dim: "INTIMIDATION" },
    { text: "ते म्हणतात तक्रार मागे घे", flag: "PRESSURE_TO_WITHDRAW", dim: "INTIMIDATION" },
    { text: "आम्हाला गावातून हाकलून दिले", flag: "DISPLACED", dim: "SOCIAL_ISOLATION" },
    { text: "गावाने बहिष्कार टाकला आहे", dim: "SOCIAL_ISOLATION" },
  ],
  ta: [
    { text: "அவர்கள் இப்போது இங்கே இருக்கிறார்கள்", flag: "ACCUSED_PRESENT", dim: "INTIMIDATION" },
    { text: "நான் இன்று சாகப் போகிறேன்", flag: "SUICIDAL_INTENT", dim: "SUICIDAL_IDEATION" },
    { text: "கொலை மிரட்டல் வருகிறது", flag: "THREAT_TO_LIFE", dim: "INTIMIDATION" },
    { text: "புகாரை திரும்பப் பெறச் சொல்கிறார்கள்", flag: "PRESSURE_TO_WITHDRAW", dim: "INTIMIDATION" },
    { text: "எங்களை ஊரை விட்டு விரட்டினார்கள்", flag: "DISPLACED", dim: "SOCIAL_ISOLATION" },
    { text: "ஊர் மக்கள் எங்களைப் புறக்கணிக்கிறார்கள்", dim: "SOCIAL_ISOLATION" },
  ],
  bn: [
    { text: "ওরা এখন এখানে আছে, আমি ভয় পাচ্ছি", flag: "ACCUSED_PRESENT", dim: "INTIMIDATION" },
    { text: "আমি আজ আত্মহত্যা করব", flag: "SUICIDAL_INTENT", dim: "SUICIDAL_IDEATION" },
    { text: "ওরা মেরে ফেলার হুমকি দিয়েছে", flag: "THREAT_TO_LIFE", dim: "INTIMIDATION" },
    { text: "মামলা তুলে নিতে চাপ দিচ্ছে", flag: "PRESSURE_TO_WITHDRAW", dim: "INTIMIDATION" },
    { text: "আমাদের গ্রাম থেকে তাড়িয়ে দিয়েছে", flag: "DISPLACED", dim: "SOCIAL_ISOLATION" },
    { text: "গ্রামে আমাদের একঘরে করে রেখেছে", dim: "SOCIAL_ISOLATION" },
  ],
};

describe("regional safety lexicon (task 8.1)", () => {
  it("is part of the lexicon version", () => {
    expect(LEXICON_VERSION).toMatch(/mr-.*ta-.*bn-/);
  });

  for (const [lang, cases] of Object.entries(CASES)) {
    describe(lang, () => {
      for (const c of cases) {
        it(`catches: ${c.flag ?? c.dim}`, () => {
          expect(activeDims(c.text)).toContain(c.dim);
          if (c.flag) expect(flagsOf(c.text)).toContain(c.flag);
        });
      }
    });
  }

  it("respects negation (no flag when the sign is denied)", () => {
    expect(flagsOf("मला मरायचे आहे असे नाही")).not.toContain("SUICIDAL_INTENT");
    expect(flagsOf("আমি আত্মহত্যা করব না")).not.toContain("SUICIDAL_INTENT");
    expect(flagsOf("நான் தற்கொலை செய்யப் போகிறேன் இல்லை")).not.toContain("SUICIDAL_INTENT");
  });

  it("stays fast with six rule sets (NFR-PERF-04, < 50 ms per message)", () => {
    const long = Object.values(CASES)
      .flat()
      .map((c) => c.text)
      .join(" । ")
      .repeat(5);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) lexiconSignals(long);
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});
