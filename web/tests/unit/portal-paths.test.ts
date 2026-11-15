/** Public page and portal helpers (task F.2): language and ?way= are hints only; anything unknown is dropped. */
import { describe, expect, it } from "vitest";
import { parseLang, parseWay, portalPath, publicPath, WAYS, withWay } from "@/lib/portal";

describe("parseLang", () => {
  it("accepts the five victim languages", () => {
    for (const l of ["en", "hi", "mr", "ta", "bn"]) expect(parseLang(l)).toBe(l);
  });
  it("falls back to English for anything else", () => {
    for (const v of [undefined, null, "", "fr", "EN", "hi-IN", "<script>"]) expect(parseLang(v)).toBe("en");
  });
  it("uses the first value of a repeated parameter", () => {
    expect(parseLang(["ta", "hi"])).toBe("ta");
  });
});

describe("publicPath", () => {
  it("adds ?lang only for non-English pages", () => {
    expect(publicPath("en")).toBe("/");
    expect(publicPath("hi")).toBe("/?lang=hi");
    expect(publicPath("ta", "/privacy", "#exit")).toBe("/privacy?lang=ta#exit");
    expect(publicPath("en", "/how-it-works")).toBe("/how-it-works");
  });
});

describe("way hint", () => {
  it("knows exactly write, speak and guided", () => {
    expect([...WAYS]).toEqual(["write", "speak", "guided"]);
    for (const w of WAYS) expect(parseWay(w)).toBe(w);
  });
  it("drops anything else, so free text can never travel in the URL", () => {
    for (const v of [null, undefined, "", "WRITE", "voice", "write&x=1", "I was attacked"]) expect(parseWay(v)).toBeNull();
  });
  it("appends way= with the right separator, or nothing", () => {
    expect(withWay(portalPath("en"), "write")).toBe("/portal/en?way=write");
    expect(withWay(portalPath("hi", "/consent?i=abc"), "speak")).toBe("/portal/hi/consent?i=abc&way=speak");
    expect(withWay(portalPath("bn", "/chat?i=abc"), null)).toBe("/portal/bn/chat?i=abc");
  });
});
