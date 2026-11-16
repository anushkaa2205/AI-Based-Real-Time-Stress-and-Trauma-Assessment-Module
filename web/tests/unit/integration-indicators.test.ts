/** Task M.5 (gap V1, FR-IND-04): how each indicator's evidence reaches an integrating system. */
import { describe, expect, it } from "vitest";
import { evidenceOf, integrationIndicator } from "@/core/integration/indicators";

const windows = new Map([["w2", { windowIndex: 2, startMs: 10_000, endMs: 15_000 }]]);

describe("integration indicators (M.5)", () => {
  it("gives voice evidence its place in the call", () => {
    expect(evidenceOf({ type: "ACOUSTIC_EVENT", voiceWindowId: "w2", eventType: "LONG_SILENCE" }, windows)).toEqual({
      type: "ACOUSTIC_EVENT",
      cue: "LONG_SILENCE",
      windowIndex: 2,
      startMs: 10_000,
      endMs: 15_000,
    });
    // A window that is gone (purged) still names the cue, without a time.
    expect(evidenceOf({ type: "ACOUSTIC_EVENT", voiceWindowId: "gone", eventType: "SIGH" }, windows)).toMatchObject({ cue: "SIGH", startMs: null });
  });

  it("names the case-detail field and keeps the text span even when the quote cannot be read", () => {
    expect(evidenceOf({ type: "CONTEXT_FIELD", contextField: "accusedNearby" }, windows)).toEqual({ type: "CONTEXT_FIELD", field: "accusedNearby" });
    expect(evidenceOf({ type: "TEXT_SPAN", messageId: "m1", spanStart: 3, spanEnd: 9, quoteEnc: "not-a-token" }, windows)).toEqual({
      type: "TEXT_SPAN",
      messageId: "m1",
      start: 3,
      end: 9,
      quote: null,
    });
  });

  it("returns only the signal, never staff review details", () => {
    const out = integrationIndicator(
      {
        _id: "i1",
        dimension: "INTIMIDATION",
        source: "SAFETY_LEXICON",
        score: 0.9,
        confidence: 0.9,
        flags: ["THREAT_TO_LIFE"],
        evidence: { type: "CONTEXT_FIELD", contextField: "ongoingThreats" },
        createdAt: new Date("2026-11-16T10:00:00Z"),
        // a reviewed indicator carries these in the database; they must not leave
        ...({ review: { reason: "staff note", byUserId: "u1" }, label: "staff label" } as object),
      },
      windows,
    );
    expect(Object.keys(out).sort()).toEqual(["confidence", "createdAt", "dimension", "evidence", "flags", "id", "negated", "score", "source", "status"]);
    expect(out.status).toBe("ACTIVE");
  });
});
