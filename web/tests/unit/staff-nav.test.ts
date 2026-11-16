import { describe, expect, it } from "vitest";
import { STAFF_PAGES, canOpen, homeFor, navFor, ROLE_HOME } from "@/lib/staff-nav";
import { ROLES } from "@/models/enums";

describe("staff navigation (task 1.11)", () => {
  it("lands every role on a page it may open", () => {
    for (const role of ROLES) {
      expect(canOpen(role, ROLE_HOME[role]), role).toBe(true);
      expect(navFor(role).map((p) => p.href)).toContain(homeFor(role));
    }
  });

  it("never shows a page a role may not open", () => {
    for (const role of ROLES) {
      for (const page of navFor(role)) expect(page.roles).toContain(role);
    }
  });

  it("keeps police and welfare away from case pages", () => {
    for (const role of ["POLICE_LIAISON", "WELFARE_OFFICER"] as const) {
      expect(canOpen(role, "counsellor")).toBe(false);
      expect(canOpen(role, "operator")).toBe(false);
      expect(canOpen(role, "district")).toBe(false);
      expect(navFor(role)).toHaveLength(1);
    }
  });

  it("offers the demo input layer to supervisors only (M.11, M.14)", () => {
    expect(STAFF_PAGES.demo.roles).toEqual(["NHAA_SUPERVISOR"]);
    for (const role of ["POLICE_LIAISON", "WELFARE_OFFICER", "COUNSELLOR", "OPERATOR", "DISTRICT_OFFICER"] as const) expect(canOpen(role, "demo")).toBe(false);
  });

  it("gives each analytics role the analytics page", () => {
    expect(STAFF_PAGES.analytics.roles).toEqual(
      expect.arrayContaining(["STATE_ADMIN", "MINISTRY_ADMIN", "NHAA_SUPERVISOR", "DISTRICT_OFFICER"]),
    );
  });
});
