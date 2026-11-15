/**
 * "Quiet Paper" tokens (task F.2, brief §5.2, checklist §6): read from globals.css, where they are
 * defined once, and checked against WCAG 2.1 AA: 4.5:1 for text (1.4.3), 3:1 for control borders
 * and the focus indicator (1.4.11). Line (#d8d2c7) is decorative only and is not checked as text.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf8");
const block = css.match(/\[data-theme="quiet-paper"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const tokens = Object.fromEntries([...block.matchAll(/--qp-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()]));

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const tok = (name: string) => {
  const v = tokens[name];
  if (!v) throw new Error(`--qp-${name} is not defined in globals.css`);
  return v;
};

describe("Quiet Paper tokens", () => {
  it("are defined once, in globals.css, with the brief's values where they pass", () => {
    expect(tok("page")).toBe("#f4f1ea");
    expect(tok("surface")).toBe("#fffefb");
    expect(tok("ink")).toBe("#1b2a41");
    expect(tok("primary")).toBe("#245b57");
    expect(tok("line")).toBe("#d8d2c7");
    expect(tok("danger")).toBe("#a63a2b");
    expect(css.match(/--qp-page:/g)).toHaveLength(1);
  });

  const backgrounds = ["page", "surface", "soft-accent"];
  const textTokens = ["ink", "muted", "primary", "primary-hover", "warning", "danger", "focus", "disabled"];
  for (const fg of textTokens) {
    for (const bg of backgrounds) {
      it(`${fg} text on ${bg} is at least 4.5:1`, () => {
        expect(contrast(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("white text on primary, primary-hover and danger buttons is at least 4.5:1", () => {
    for (const bg of ["primary", "primary-hover", "danger"]) expect(contrast("#ffffff", tok(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("disabled text on a disabled button is at least 4.5:1", () => {
    expect(contrast(tok("disabled"), tok("disabled-surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders and the focus ring are at least 3:1 against the page and cards", () => {
    for (const fg of ["field-line", "focus"]) {
      for (const bg of ["page", "surface"]) expect(contrast(tok(fg), tok(bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it("the brief's #777777 disabled grey would fail on the page, which is why it was darkened", () => {
    expect(contrast("#777777", tok("page"))).toBeLessThan(4.5);
  });
});
