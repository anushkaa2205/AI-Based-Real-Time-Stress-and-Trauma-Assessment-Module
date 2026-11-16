/** Task N.3: the case status an integrating system (or the demo's tracking page) may read. */
import { describe, expect, it } from "vitest";
import { CaseStatusResponse } from "@/contracts/integration";
import { caseStatusView } from "@/core/integration/status";

const c = { docketNumber: "NHAA-2026-MH-000001", status: "ACTION_TAKEN" as const, createdAt: new Date("2026-11-16T10:00:00Z"), updatedAt: new Date("2026-11-16T11:00:00Z") };

describe("integration case status (N.3)", () => {
  it("returns exactly status, dates and arranged support; never anything diagnostic", () => {
    const out = caseStatusView(
      { ...c, ...({ currentBand: "CRITICAL", currentSvi: 91, assignedCounsellorId: "u1" } as object) },
      [
        { type: "COUNSELLING", status: "APPROVED" },
        { type: "LEGAL_AID", status: "PROPOSED" },
        { type: "EMERGENCY_SUPPORT", status: "AUTO_TRIGGERED" },
        { type: "COUNSELLING", status: "APPROVED" },
        { type: "POLICE_INTERVENTION", status: "REJECTED" },
      ],
    );
    expect(Object.keys(out).sort()).toEqual(["docketNumber", "registeredAt", "status", "support", "updatedAt"]);
    expect(out.support).toEqual(["COUNSELLING", "EMERGENCY_SUPPORT"]);
    expect(JSON.stringify(out)).not.toMatch(/band|svi|CRITICAL|91|u1/i);
    expect(CaseStatusResponse.parse(out)).toEqual(out);
  });

  it("lists no support while everything is still proposed", () => {
    expect(caseStatusView({ ...c, status: "NEW" }, [{ type: "COUNSELLING", status: "PROPOSED" }]).support).toEqual([]);
  });
});
