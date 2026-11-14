import { describe, expect, it } from "vitest";
import { redact } from "@/core/privacy/redact";

// All names, numbers and places are invented test data (CLAUDE.md rule 11).
const ctx = { names: ["Asha Devi", "Ramesh Kumar"], addresses: ["House 12, Ward 7, Village Testpur"] };

describe("redact (task 1.4)", () => {
  describe("English", () => {
    it("redacts a mobile number in several formats", () => {
      for (const phone of ["9876543210", "98765 43210", "+91 98765-43210", "+919876543210", "09876543210"]) {
        expect(redact(`Call me on ${phone} please`).text).toBe("Call me on [PHONE] please");
      }
    });

    it("redacts a landline with STD code", () => {
      expect(redact("Office number 011-23456789").text).toBe("Office number [PHONE]");
    });

    it("redacts e-mail addresses", () => {
      expect(redact("write to test.user+1@example.org now").text).toBe("write to [EMAIL] now");
    });

    it("redacts a 12-digit ID number, grouped or not", () => {
      expect(redact("ID 2345 6789 0123 given").text).toBe("ID [ID] given");
      expect(redact("ID 234567890123 given").text).toBe("ID [ID] given");
    });

    it("redacts a PIN code", () => {
      expect(redact("near the market, 411001").text).toBe("near the market, [PIN]");
      expect(redact("PIN 110 001").text).toBe("PIN [PIN]");
    });

    it("redacts names and addresses from context, case-insensitively", () => {
      const r = redact("ASHA DEVI lives at House 12, Ward 7, Village Testpur with ramesh.", ctx);
      expect(r.text).toBe("[NAME] lives at [ADDRESS] with [NAME].");
    });

    it("redacts a first name used on its own", () => {
      expect(redact("Asha said they came again", ctx).text).toBe("[NAME] said they came again");
    });

    it("does not redact a name inside another word", () => {
      expect(redact("Ashapur is a test town", ctx).text).toBe("Ashapur is a test town");
    });

    it("leaves short numbers alone", () => {
      const s = "They came 3 times in 2 days, around 10 people.";
      expect(redact(s).text).toBe(s);
    });
  });

  describe("Hindi (Devanagari)", () => {
    it("redacts a phone number written in Devanagari digits", () => {
      expect(redact("मेरा नंबर ९८७६५४३२१० है").text).toBe("मेरा नंबर [PHONE] है");
    });

    it("redacts a Devanagari name from context with Indic word boundaries", () => {
      const r = redact("आशा देवी को धमकी दी गई", { names: ["आशा देवी"] });
      expect(r.text).toBe("[NAME] को धमकी दी गई");
    });

    it("does not match a name inside a longer Devanagari word", () => {
      expect(redact("आशाओं के साथ", { names: ["आशा"] }).text).toBe("आशाओं के साथ");
    });

    it("redacts a PIN code and phone in mixed Hindi text", () => {
      expect(redact("पिन ४११००१, फोन 98765 43210").text).toBe("पिन [PIN], फोन [PHONE]");
    });
  });

  describe("Hinglish", () => {
    it("redacts phone, name and address in Romanised Hindi", () => {
      const r = redact("mera naam Asha Devi hai, ghar House 12, Ward 7 me hai, number 9876543210", ctx);
      expect(r.text).toBe("mera naam [NAME] hai, ghar [ADDRESS], [ADDRESS] me hai, number [PHONE]");
    });
  });

  it("reports spans against the original text", () => {
    const original = "Call 9876543210 now";
    const r = redact(original);
    expect(r.redactions).toEqual([{ type: "PHONE", start: 5, end: 15 }]);
    expect(original.slice(5, 15)).toBe("9876543210");
  });

  it("returns text unchanged when there is no PII", () => {
    const s = "They threatened us outside the house yesterday.";
    expect(redact(s)).toEqual({ text: s, redactions: [] });
  });

  it("is deterministic", () => {
    const s = "Asha Devi 9876543210 test@example.org";
    expect(redact(s, ctx)).toEqual(redact(s, ctx));
  });
});
