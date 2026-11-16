/** Task M.14: the recorded audio library points at evaluation scenarios (PRODUCT_VISION.md §9). */
import { describe, expect, it } from "vitest";
import { findScenario, loadLibrary, recordingPath, scriptOf } from "@/core/demo/library";

describe("demo library (M.14)", () => {
  const lib = loadLibrary();

  it("lists every scenario in library.json with its evaluation label", () => {
    expect(lib.length).toBe(10);
    for (const s of lib) {
      expect(s.id).toMatch(/^S\d{3}$/);
      expect(["LOW", "MODERATE", "HIGH", "CRITICAL"]).toContain(s.expected.band);
      expect(["en", "hi", "mr", "ta", "bn"]).toContain(s.language);
      expect(s.script.length).toBeGreaterThan(0);
    }
    expect(new Set(lib.map((s) => s.id)).size).toBe(lib.length);
  });

  it("covers every band, with operator questions to separate in two-voice recordings", () => {
    expect(new Set(lib.map((s) => s.expected.band))).toEqual(new Set(["LOW", "MODERATE", "HIGH", "CRITICAL"]));
    expect(lib.filter((s) => s.script.some((t) => t.speaker === "OPERATOR")).length).toBeGreaterThanOrEqual(8);
  });

  it("turns a scenario's messages into a script: plain strings are the caller's words", () => {
    expect(scriptOf(["I am scared", { sender: "OPERATOR", text: "Are you safe?" }, { sender: "VICTIM", text: "No" }])).toEqual([
      { speaker: "CALLER", text: "I am scared" },
      { speaker: "OPERATOR", text: "Are you safe?" },
      { speaker: "CALLER", text: "No" },
    ]);
  });

  it("finds recordings only under demo/library/audio, by scenario id", () => {
    expect(recordingPath("S047").replace(/\\/g, "/")).toMatch(/demo\/library\/audio\/S047\.wav$/);
    expect(() => recordingPath("../../secrets")).toThrow();
    expect(findScenario("S049")?.expected.band).toBe("HIGH");
    expect(findScenario("S999")).toBeNull();
  });
});
