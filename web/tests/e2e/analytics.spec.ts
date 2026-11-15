/**
 * Analytics (tasks 8.2–8.3): AC-DSH-02. Anonymised, small cells suppressed, scope enforced on the server.
 * Uses synthetic daily_stats rows for a throw-away district in the year 2000, removed afterwards.
 */
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { staffLogin, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });

const districtId = new mongoose.Types.ObjectId();
const stateId = new mongoose.Types.ObjectId();
const range = "from=2000-01-01&to=2000-01-07";

test.beforeAll(async () => {
  await withDb(async (db) => {
    await db.collection("districts").insertOne({ _id: districtId, stateId, code: `ZZ-TEST-${districtId}`, name: "Test district (synthetic)" });
    const base = { stateId, districtId, channel: "CHATBOT", language: "hi", criticalAlerts: 0, ackCount: 0, firstResponseCount: 0, slaBreaches: 0 };
    await db.collection("daily_stats").insertMany([
      { ...base, day: new Date("2000-01-03T00:00:00Z"), band: "LOW", interactions: 20, referralsCreated: { LEGAL_AID: 6 }, referralsDone: { LEGAL_AID: 5 } },
      { ...base, day: new Date("2000-01-03T00:00:00Z"), band: "HIGH", interactions: 9 },
      { ...base, day: new Date("2000-01-04T00:00:00Z"), band: "CRITICAL", interactions: 3, criticalAlerts: 3, medianAckSec: 50, ackCount: 3 },
    ]);
  });
});

test.afterAll(async () => {
  await withDb(async (db) => {
    await db.collection("daily_stats").deleteMany({ districtId });
    await db.collection("districts").deleteOne({ _id: districtId });
  });
});

test("ministry analytics show no identifiers and suppress every cell under 5 (AC-DSH-02)", async ({ page }) => {
  await staffLogin(page, "MINISTRY_ADMIN");
  const q = `${range}&scope=district&districtId=${districtId}`;
  const s = await page.request.get(`/api/v1/staff/analytics/summary?${q}`).then((r) => r.json());
  expect(s.interactions).toEqual({ value: 32, suppressed: false });
  expect(s.byBand.LOW).toEqual({ value: 20, suppressed: false });
  expect(s.byBand.CRITICAL).toEqual({ value: null, suppressed: true });
  expect(s.byBand.HIGH).toEqual({ value: null, suppressed: true }); // secondary suppression
  expect(s.criticalAlerts.suppressed).toBe(true);
  expect(s.medianAckSec.suppressed).toBe(true);

  const heat = await page.request.get(`/api/v1/staff/analytics/heatmap?${q}`).then((r) => r.json());
  expect(heat.items).toEqual([{ districtId: String(districtId), districtName: "Test district (synthetic)", criticalPer1000: 94, highPer1000: 281, count: 32, suppressed: false }]);

  const cap = await page.request.get(`/api/v1/staff/analytics/capacity?${q}`).then((r) => r.json());
  expect(cap.items).toEqual([expect.objectContaining({ supportType: "LEGAL_AID", demand: 6, completed: 5, suppressed: false })]);

  const csv = await page.request.get(`/api/v1/staff/analytics/export.csv?${q}`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text).toContain("interactions,32");
  expect(text).toContain("band_critical,<5");

  // Nothing personal anywhere in the responses.
  const all = JSON.stringify([s, heat, cap]) + text;
  expect(all).not.toMatch(/NHAA-\d{4}|docket|phone|name"?:\s*"(?!Test district)/i);

  await page.goto("/analytics");
  await expect(page.getByTestId("tile-interactions")).toBeVisible();
});

test("scope is enforced on the server; other roles get 403 (FR-DSH-06, NFR-PRI-02)", async ({ page }) => {
  await staffLogin(page, "DISTRICT_OFFICER");
  expect((await page.request.get(`/api/v1/staff/analytics/summary?${range}&scope=district&districtId=${districtId}`)).status()).toBe(403);
  const own = await page.request.get(`/api/v1/staff/analytics/summary?${range}`).then((r) => r.json());
  expect(own.interactions.value).toBe(0); // the test district is not theirs

  for (const role of ["COUNSELLOR", "OPERATOR", "POLICE_LIAISON", "WELFARE_OFFICER", "SYS_ADMIN", "AUDITOR"]) {
    await staffLogin(page, role);
    expect((await page.request.get(`/api/v1/staff/analytics/summary?${range}`)).status(), role).toBe(403);
  }
});
