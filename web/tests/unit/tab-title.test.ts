/** Open Critical alert count in the tab title (task H.7; staff alert banner). */
import { describe, expect, it } from "vitest";
import { titleWithCount } from "@/components/staff/alert-sound";

describe("titleWithCount", () => {
  it("puts the count in front when Critical alerts are open", () => {
    expect(titleWithCount("Nivara", 3)).toBe("(3) Nivara");
  });
  it("replaces an older count instead of stacking", () => {
    expect(titleWithCount("(3) Nivara", 5)).toBe("(5) Nivara");
  });
  it("removes the count when none are open", () => {
    expect(titleWithCount("(3) Nivara", 0)).toBe("Nivara");
    expect(titleWithCount("Nivara", 0)).toBe("Nivara");
  });
  it("is idempotent, so re-applying never changes the title again", () => {
    const once = titleWithCount("Approvals · Nivara", 2);
    expect(titleWithCount(once, 2)).toBe(once);
  });
  it("leaves a title that only looks like a count elsewhere alone", () => {
    expect(titleWithCount("Case (2) · Nivara", 1)).toBe("(1) Case (2) · Nivara");
  });
});
