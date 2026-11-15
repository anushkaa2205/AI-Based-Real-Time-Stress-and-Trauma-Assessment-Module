/**
 * Recommendations, referrals and stakeholder views end to end (task 6.8).
 * AC-REC-03, AC-REC-05, AC-DSH-01, AC-DSH-03, FR-REC-05/08/09.
 * Synthetic data only.
 */
import { expect, test, type Page } from "@playwright/test";
import { STAFF_PAGES, homeFor, navFor } from "../../src/lib/staff-nav";
import type { Role } from "../../src/models/enums";
import { staffLogin, victimSession, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });

/** A Critical case with "accused nearby" → police intervention proposed, emergency support auto-triggered. */
async function policeCase(request: Parameters<typeof victimSession>[0]) {
  const v = await victimSession(request);
  await v.call("/consent", { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: true });
  await v.call("/screeners", { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 });
  await v.call("/screeners", { instrument: "SAFETY_CHECK", itemCode: "SAFETY_ACCUSED_NEARBY", value: 1 });
  const caseId = await withDb(async (db) => String((await db.collection("cases").findOne({ docketNumber: v.docketNumber }))!._id));
  return { ...v, caseId };
}

async function recFor(page: Page, docket: string, query: string, type: string) {
  // Page through the inbox: earlier runs leave many pending proposals in the shared test database.
  let cursor: string | null = null;
  do {
    const sep = query.includes("?") ? "&" : "?";
    const url: string = `/api/v1/staff/recommendations${query}${sep}limit=100${cursor ? `&cursor=${cursor}` : ""}`;
    const inbox = (await page.request.get(url).then((r) => r.json())) as { items: { id: string; type: string; docketNumber: string }[]; nextCursor: string | null };
    const hit = inbox.items.find((i) => i.docketNumber === docket && i.type === type);
    if (hit) return hit;
    cursor = inbox.nextCursor;
  } while (cursor);
  return undefined;
}

const REFERRAL_KEYS = ["actionRequested", "contactRoute", "createdAt", "docketNumber", "dueAt", "id", "locationHint", "outcomeNote", "status", "type", "urgency"];

test("police see nothing until a counsellor approves; then only a minimal action request (AC-REC-03, AC-REC-05, AC-DSH-01)", async ({ browser, request }) => {
  const v = await policeCase(request);
  const counsellor = await browser.newPage();
  const police = await browser.newPage();
  await staffLogin(counsellor, "COUNSELLOR");
  await staffLogin(police, "POLICE_LIAISON");

  // Before approval: nothing in the police queue, and police cannot approve (AC-REC-03).
  const before = await police.request.get("/api/v1/staff/referrals").then((r) => r.json());
  expect((before.items as { docketNumber: string }[]).some((r) => r.docketNumber === v.docketNumber)).toBe(false);
  const rec = await recFor(counsellor, v.docketNumber, "?status=PROPOSED", "POLICE_INTERVENTION");
  expect(rec, "a police intervention was proposed").toBeTruthy();
  expect((await police.request.post(`/api/v1/staff/recommendations/${rec!.id}/decision`, { data: { decision: "APPROVE" } })).status()).toBe(403);

  // Referral text over 300 characters is refused.
  const long = await counsellor.request.post(`/api/v1/staff/recommendations/${rec!.id}/decision`, {
    data: { decision: "APPROVE", referral: { actionRequested: "x".repeat(301) } },
  });
  expect(long.status()).toBe(422);
  expect((await long.json()).code).toBe("REFERRAL_TOO_DETAILED");

  // The counsellor approves from the case page (the shared test database holds many older proposals).
  await counsellor.goto(`/counsellor/case/${v.caseId}`);
  const row = counsellor.getByTestId("rec-actions-POLICE_INTERVENTION");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row.getByRole("note")).toContainText("outside agency");
  await row.getByPlaceholder(/Village or ward/).fill("Ward 7 (synthetic)");
  await row.getByRole("button", { name: "Approve and send referral" }).click();
  await expect(counsellor.getByTestId("case-message")).toContainText("referral was sent");
  await counsellor.goto("/approvals");
  await expect(counsellor.getByTestId("approval-inbox")).toBeVisible();
  const again = await counsellor.request.post(`/api/v1/staff/recommendations/${rec!.id}/decision`, { data: { decision: "APPROVE" } });
  expect(again.status()).toBe(409);

  // Police: the referral holds the action-request fields and nothing else (AC-REC-05).
  const after = await police.request.get("/api/v1/staff/referrals").then((r) => r.json());
  const ref = (after.items as Record<string, unknown>[]).find((r) => r.docketNumber === v.docketNumber)!;
  expect(ref).toBeTruthy();
  for (const k of Object.keys(ref)) expect(REFERRAL_KEYS).toContain(k);
  expect(ref.locationHint).toBe("Ward 7 (synthetic)");
  expect(JSON.stringify(ref)).not.toMatch(/svi|band|indicator|narrative|intimidation|threat/i);

  await police.goto("/police");
  const card = police.getByTestId("referral-row").filter({ hasText: v.docketNumber });
  await expect(card).toContainText("Protection visit");
  await expect(card).not.toContainText(/SVI|critical risk/i);
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(card).toHaveAttribute("data-status", "ACCEPTED");
  // Skipping a step is refused (FR-REC-08).
  expect((await police.request.patch(`/api/v1/staff/referrals/${ref.id}`, { data: { status: "DONE" } })).status()).toBe(409);

  // Police have no route to case data (task 6.4, AC-DSH-01).
  const blocked = [
    `/api/v1/staff/cases/${v.caseId}`,
    `/api/v1/staff/cases/${v.caseId}/notes`,
    `/api/v1/staff/cases/${v.caseId}/identity`,
    `/api/v1/staff/interactions/${v.interactionId}/transcript`,
    `/api/v1/staff/interactions/${v.interactionId}/indicators`,
    `/api/v1/staff/interactions/${v.interactionId}/assessments`,
    `/api/v1/staff/interactions/${v.interactionId}/assessments/current`,
    "/api/v1/staff/recommendations",
    "/api/v1/staff/follow-ups",
  ];
  for (const url of blocked) expect((await police.request.get(url)).status(), url).toBe(403);

  // Welfare officers do not see police referrals.
  const welfare = await browser.newPage();
  await staffLogin(welfare, "WELFARE_OFFICER");
  const w = await welfare.request.get("/api/v1/staff/referrals").then((r) => r.json());
  expect((w.items as { docketNumber: string }[]).some((r) => r.docketNumber === v.docketNumber)).toBe(false);

  // Auto-triggered emergency support is reviewed afterwards, once (FR-REC-05).
  const em = await recFor(counsellor, v.docketNumber, "?needsReview=true", "EMERGENCY_SUPPORT");
  expect(em).toBeTruthy();
  expect((await counsellor.request.post(`/api/v1/staff/recommendations/${em!.id}/decision`, { data: { decision: "POST_REVIEW" } })).status()).toBe(200);
  expect((await counsellor.request.post(`/api/v1/staff/recommendations/${em!.id}/decision`, { data: { decision: "POST_REVIEW" } })).status()).toBe(409);

  await withDb(async (db) => {
    const audit = await db.collection("audit_logs").find({ entityId: { $in: [rec!.id, String(ref.id)] } }).toArray();
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["recommendation.decide", "referral.update"]));
  });
  await Promise.all([counsellor.close(), police.close(), welfare.close()]);
});

test("district officer decides police proposals in the district and sees band and SVI only (FR-DSH-03)", async ({ page, request }) => {
  const v = await policeCase(request);
  await staffLogin(page, "DISTRICT_OFFICER");
  const rec = await recFor(page, v.docketNumber, "?status=PROPOSED", "POLICE_INTERVENTION");
  expect(rec, "district officers see police proposals in their district").toBeTruthy();
  const counselling = await page.request.get("/api/v1/staff/recommendations?status=PROPOSED").then((r) => r.json());
  for (const i of counselling.items as { type: string }[]) expect(["POLICE_INTERVENTION", "WITNESS_PROTECTION"]).toContain(i.type);

  await page.goto("/district");
  const row = page.getByTestId("district-case-row").filter({ hasText: v.docketNumber });
  await expect(row).toBeVisible();
  await expect(row.locator("[data-band=CRITICAL]")).toBeVisible();
  const queue = await page.request.get("/api/v1/staff/cases?band=CRITICAL").then((r) => r.json());
  const item = (queue.items as Record<string, unknown>[]).find((c) => c.docketNumber === v.docketNumber)!;
  expect(item.topReason).toBeUndefined();
  expect((await page.request.get(`/api/v1/staff/interactions/${v.interactionId}/transcript`)).status()).toBe(403);
  // Escalated alerts reach the district without the evidence-based reason (§4 rule 2).
  const alerts = await page.request.get("/api/v1/staff/alerts").then((r) => r.json());
  for (const a of alerts.items as { reason: string }[]) expect(a.reason).not.toMatch(/threat|intimidation|suicid|OV-\d/i);
});

test("closing a Critical case needs a follow-up; the reminder fires and an unanswered one is marked missed (FR-REC-09)", async ({ page, request }) => {
  const v = await policeCase(request);
  await staffLogin(page, "COUNSELLOR");
  const close = await page.request.patch(`/api/v1/staff/cases/${v.caseId}`, { data: { status: "CLOSED" } });
  expect(close.status()).toBe(422);
  expect((await close.json()).code).toBe("FOLLOW_UP_REQUIRED");

  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const fu = await page.request.post(`/api/v1/staff/cases/${v.caseId}/follow-ups`, { data: { dueAt: due, channel: "VOICE_CALL" } });
  expect(fu.status()).toBe(201);
  const followUp = await fu.json();
  expect(followUp.docketNumber).toBe(v.docketNumber);
  expect((await page.request.patch(`/api/v1/staff/cases/${v.caseId}`, { data: { status: "CLOSED" } })).status()).toBe(200);

  // Fast-forward: reminder, then the "missed" check a day later.
  const jobs = { headers: { "x-jobs-secret": process.env.JOBS_SECRET! } };
  for (const stage of ["due", "miss"]) {
    await withDb((db) =>
      db.collection("jobs").updateMany({ type: "followup.remind", "payload.followUpId": followUp.id, "payload.stage": stage, doneAt: null }, { $set: { runAt: new Date("2000-01-01T00:00:00Z") } }),
    );
    expect((await request.post("/api/v1/internal/jobs/run", jobs)).status()).toBe(200);
  }
  await withDb(async (db) => {
    const doc = await db.collection("follow_ups").findOne({ caseId: (await db.collection("cases").findOne({ docketNumber: v.docketNumber }))!._id });
    expect(doc!.status).toBe("MISSED");
  });
  const missed = await page.request.get(`/api/v1/staff/follow-ups?status=MISSED&caseId=${v.caseId}`).then((r) => r.json());
  expect(missed.items).toHaveLength(1);
});

const ROLES: Role[] = ["OPERATOR", "NHAA_SUPERVISOR", "COUNSELLOR", "DISTRICT_OFFICER", "POLICE_LIAISON", "WELFARE_OFFICER", "STATE_ADMIN", "MINISTRY_ADMIN", "SYS_ADMIN", "AUDITOR"];

for (const role of ROLES) {
  test(`${role} lands on its own dashboard and cannot open the others (AC-DSH-03)`, async ({ page }) => {
    await staffLogin(page, role);
    await page.goto("/staff");
    const own = navFor(role);
    await expect(page).toHaveURL(new RegExp(`${homeFor(role)}$`));
    const nav = page.getByRole("navigation", { name: "Staff" });
    await expect(nav.getByRole("link")).toHaveText(own.map((p) => p.label));
    for (const p of Object.values(STAFF_PAGES)) {
      const allowed = (p.roles as readonly Role[]).includes(role);
      const res = await page.request.get(p.href, { maxRedirects: 0 });
      expect(res.status(), `${role} → ${p.href}`).toBe(allowed ? 200 : 403);
    }
  });
}
