/**
 * Responder dashboards and live alerts end to end (task 5.9).
 * AC-ALR-01, AC-ALR-02, AC-CASE-01, AC-CASE-02, AC-IND-02, AC-AUD-01, AC-RISK-04.
 * Synthetic data only; test cases are created in the database and removed afterwards.
 */
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { dropIntegrationKeys, integrationSession, staffLogin, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(dropIntegrationKeys);

/** The person says the accused is outside the house now: the safety lexicon fires OV-2 → Critical. */
const DANGER_NOW = "They are standing outside my house right now.";

/** A new interaction from a calling system (text analysis and counsellor sharing consented). */
async function makeCritical(request: Parameters<typeof integrationSession>[0]) {
  return integrationSession(request);
}

test("a Critical case appears on the counsellor's screen within 5 s, without a refresh (AC-ALR-01, AC-RISK-04)", async ({ page, request }) => {
  await staffLogin(page, "COUNSELLOR");
  await page.goto("/counsellor");
  await expect(page.getByTestId("queue").or(page.getByText("No open cases."))).toBeVisible();
  await page.waitForTimeout(1500); // let the real-time subscription settle

  const v = await makeCritical(request);
  const r = await v.say(DANGER_NOW);
  expect(r.status()).toBe(201);
  // AC-ALR-01 measures from the band change, which is committed when this response returns (the
  // message path includes the AI call, which the old structured answer did not).
  const t0 = Date.now();

  const banner = page.getByTestId("alert-CRITICAL").filter({ hasText: v.docketNumber });
  await expect(banner).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - t0).toBeLessThan(5_000);

  // Queue rows show the band as colour AND text (AC-RISK-04). The shared test database holds many older
  // Critical cases with a higher SVI, so this case may sort below the visible rows (Critical, then SVI,
  // then waiting time, FR-CASE-01); any Critical row shows the same band tag.
  const row = page.getByTestId("queue-row").filter({ has: page.locator("[data-band=CRITICAL]") }).first();
  await expect(row).toBeVisible({ timeout: 5_000 });
  await expect(row.locator("[data-band=CRITICAL]")).toHaveText(/critical/i);
});

test("an unacknowledged Critical alert escalates; acknowledgement time is stored (AC-ALR-02)", async ({ page, request }) => {
  const v = await makeCritical(request);
  await v.say(DANGER_NOW);

  const caseId = await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: v.docketNumber });
    const alert = await db.collection("alerts").findOne({ caseId: c!._id, status: "OPEN", level: "CRITICAL" });
    expect(alert).toBeTruthy();
    // Fast-forward the 2-minute timer instead of waiting. An early due time also puts this job
    // ahead of any backlog (the runner takes the oldest due jobs first).
    await db.collection("jobs").updateMany(
      { type: "alert.escalate", "payload.alertId": String(alert!._id), doneAt: null },
      { $set: { runAt: new Date("2000-01-01T00:00:00Z") } },
    );
    return c!._id;
  });

  const run = await request.post("/api/v1/internal/jobs/run", { headers: { "x-jobs-secret": process.env.JOBS_SECRET! } });
  expect(run.status()).toBe(200);
  expect(await request.post("/api/v1/internal/jobs/run", { headers: { "x-jobs-secret": "wrong" } }).then((x) => x.status())).toBe(401);

  await withDb(async (db) => {
    const alert = await db.collection("alerts").findOne({ caseId, level: "CRITICAL" });
    expect(alert!.escalationLevel).toBe(1);
    expect(alert!.acknowledgedAt ?? null).toBeNull();
  });

  // The supervisor acknowledges from the banner.
  await staffLogin(page, "NHAA_SUPERVISOR");
  await page.goto("/counsellor");
  const banner = page.getByTestId("alert-CRITICAL").filter({ hasText: v.docketNumber });
  await expect(banner).toContainText("Escalated");
  await banner.getByRole("button", { name: "Acknowledge" }).click();
  await expect(banner).toHaveCount(0);

  await withDb(async (db) => {
    const alert = await db.collection("alerts").findOne({ caseId, level: "CRITICAL" });
    expect(alert!.status).toBe("ACKNOWLEDGED");
    expect(alert!.acknowledgedAt).toBeInstanceOf(Date);
    expect(alert!.acknowledgedById).toBeTruthy();
    const pending = await db.collection("jobs").countDocuments({ type: "alert.escalate", "payload.alertId": String(alert!._id), doneAt: null });
    expect(pending).toBe(0);
  });
  const again = await page.request.post(`/api/v1/staff/alerts/${await withDb(async (db) => String((await db.collection("alerts").findOne({ caseId, level: "CRITICAL" }))!._id))}/ack`);
  expect(again.status()).toBe(409);
});

test("band override without a reason is blocked; with a reason it can lower a locked band (AC-CASE-02, FR-RISK-03)", async ({ page, request }) => {
  const v = await makeCritical(request);
  await v.say(DANGER_NOW);
  const caseId = await withDb(async (db) => String((await db.collection("cases").findOne({ docketNumber: v.docketNumber }))!._id));

  await staffLogin(page, "COUNSELLOR");
  const noReason = await page.request.post(`/api/v1/staff/cases/${caseId}/band-override`, { data: { toBand: "HIGH" } });
  expect(noReason.status()).toBe(422);
  expect((await noReason.json()).code).toBe("REASON_REQUIRED");

  await page.goto(`/counsellor/case/${caseId}`);
  const form = page.getByTestId("override-form");
  await form.getByRole("combobox").selectOption("HIGH");
  await form.getByRole("button", { name: "Change band" }).click();
  await expect(page.getByTestId("case-message")).toContainText(/reason/i);

  await form.getByPlaceholder(/Reason/).fill("Spoke to the person; they are now with family and safe (synthetic)");
  await form.getByRole("button", { name: "Change band" }).click();
  await expect(page.getByTestId("case-message")).toContainText("Band changed");

  // The same old evidence does not push it back up on the next turn (FR-RISK-03).
  await v.say("I am at my sister's place now.");
  const after = await page.request.get(`/api/v1/staff/cases/${caseId}`).then((x) => x.json());
  expect(after.band).toBe("HIGH");
  expect(after.bandOverrides).toHaveLength(1);
});

test("rejecting an indicator recalculates the SVI and keeps the original value in the audit trail (AC-IND-02, AC-AUD-01)", async ({ page, request }) => {
  const v = await makeCritical(request);
  await v.ask("Is the person who harmed you near you right now?");
  await v.say("No.");
  await v.call("/context", {}, "put");
  await v.say("Since the complaint the village has boycotted us and I feel very low.");
  const caseId = await withDb(async (db) => String((await db.collection("cases").findOne({ docketNumber: v.docketNumber }))!._id));

  await staffLogin(page, "COUNSELLOR");
  const detail = await page.request.get(`/api/v1/staff/cases/${caseId}`).then((x) => x.json());
  const before = detail.svi as number;
  const indicators = (await page.request.get(`/api/v1/staff/interactions/${v.interactionId}/indicators`).then((x) => x.json())).items as {
    id: string;
    score: number;
    negated: boolean;
    dimension: string;
  }[];
  const target = indicators.find((i) => !i.negated && i.score > 0);
  expect(target, "the message produced at least one indicator").toBeTruthy();

  const r = await page.request.patch(`/api/v1/staff/indicators/${target!.id}`, { data: { action: "REJECT", reason: "Refers to a past event already handled (synthetic)" } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.indicator.status).toBe("REJECTED");
  expect(body.indicator.score).toBe(target!.score); // original AI value kept
  expect(body.indicator.review.reason).toContain("past event");
  expect(body.assessment.trigger).toBe("INDICATOR_REVIEW");
  expect(body.assessment.svi).toBeLessThanOrEqual(before);

  await withDb(async (db) => {
    const userId = (await db.collection("users").findOne({ role: "COUNSELLOR" }))!._id;
    const audit = await db.collection("audit_logs").find({ actorId: String(userId), entityId: { $in: [target!.id, caseId] } }).toArray();
    const actions = audit.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["indicator.review", "case.view"]));
    const review = audit.find((a) => a.action === "indicator.review")!;
    expect(review.metadata).toMatchObject({ action: "REJECT", fromScore: target!.score });
    expect(JSON.stringify(review.metadata)).not.toContain("past event"); // no free text in the audit log
  });
});

test("queue order: Critical → High → Moderate → Low, then SVI, then waiting time (AC-CASE-01)", async ({ page }) => {
  const districtId = new mongoose.Types.ObjectId();
  const subjectId = new mongoose.Types.ObjectId();
  const now = Date.now();
  // 20 synthetic cases in a throw-away district.
  const seeds = Array.from({ length: 20 }, (_, i) => {
    const bandRank = (i % 4) + 1;
    return {
      docketNumber: `NHAA-2026-ZZ-9${String(i).padStart(5, "0")}`,
      subjectId,
      districtId,
      status: "NEW",
      currentBand: ["LOW", "MODERATE", "HIGH", "CRITICAL"][bandRank - 1],
      bandRank,
      currentSvi: [12, 40, 60, 80][bandRank - 1]! + (i % 3) * 3,
      waitingSince: new Date(now - ((i * 7) % 20) * 60_000),
      limitedConfidence: false,
      bandOverrides: [],
      firstContactAt: new Date(now),
      lastActivityAt: new Date(now),
    };
  });
  await withDb((db) => db.collection("cases").insertMany(seeds));
  try {
    await staffLogin(page, "NHAA_SUPERVISOR");
    const res = await page.request.get(`/api/v1/staff/cases?districtId=${districtId}&limit=100`);
    expect(res.status()).toBe(200);
    const items = (await res.json()).items as { band: string; svi: number; waitingSince: string }[];
    expect(items).toHaveLength(20);
    const rank = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 } as Record<string, number>;
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1]!;
      const b = items[i]!;
      const ok =
        rank[a.band]! > rank[b.band]! ||
        (rank[a.band] === rank[b.band] && (a.svi > b.svi || (a.svi === b.svi && a.waitingSince <= b.waitingSince)));
      expect(ok, `row ${i - 1} before row ${i}`).toBe(true);
    }
  } finally {
    await withDb((db) => db.collection("cases").deleteMany({ districtId }));
  }
});

test("police cannot open case data or real-time channels (AC-DSH-01, task 5.1)", async ({ page }) => {
  const anyCase = await withDb(async (db) => (await db.collection("cases").findOne({}))!);
  await staffLogin(page, "POLICE_LIAISON");
  expect((await page.request.get(`/api/v1/staff/cases/${anyCase._id}`)).status()).toBe(403);
  expect((await page.request.get("/api/v1/staff/cases")).status()).toBe(403);
  expect((await page.request.get("/api/v1/staff/alerts")).status()).toBe(403);
  const auth = await page.request.post("/api/v1/realtime/auth", {
    form: { socket_id: "1234.5678", channel_name: "private-oncall" },
  });
  expect(auth.status()).toBe(403);
});
