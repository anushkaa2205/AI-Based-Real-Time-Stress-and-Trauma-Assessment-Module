/**
 * Administration (task 8.6, FR-SVI-06, FR-AUD-03, API_CONTRACTS §5.9). Synthetic users and keys,
 * removed afterwards. Activation is checked on a copy of the active config, then the original
 * version is re-activated so other tests keep their numbers.
 */
import { expect, test } from "@playwright/test";
import { staffLogin, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });

const email = `e2e-${Date.now()}@example.test`;
test.afterAll(() =>
  withDb(async (db) => {
    await db.collection("users").deleteMany({ email });
    await db.collection("api_clients").deleteMany({ name: "e2e admin client (synthetic)" });
  }),
);

test("users: create with one-time password, deactivate; API keys shown once and revocable", async ({ page, request }) => {
  await staffLogin(page, "SYS_ADMIN");
  const district = await withDb(async (db) => String((await db.collection("districts").findOne({ code: "MH-PUN" }))!._id));

  const noDistrict = await page.request.post("/api/v1/staff/admin/users", { data: { email, name: "Test Officer", role: "POLICE_LIAISON" } });
  expect(noDistrict.status()).toBe(400);
  const created = await page.request.post("/api/v1/staff/admin/users", { data: { email, name: "Test Officer", role: "POLICE_LIAISON", districtId: district } });
  expect(created.status()).toBe(201);
  const u = await created.json();
  expect(u.temporaryPassword).toHaveLength(16);
  await withDb(async (db) => {
    const doc = await db.collection("users").findOne({ email });
    expect(doc!.passwordHash).not.toContain(u.temporaryPassword); // stored hashed only
    const audit = await db.collection("audit_logs").findOne({ action: "user.create", entityId: u.id });
    expect(JSON.stringify(audit!.metadata)).not.toContain(u.temporaryPassword);
  });
  expect((await page.request.patch(`/api/v1/staff/admin/users/${u.id}`, { data: { isActive: false } })).status()).toBe(200);
  const me = await page.request.get("/api/v1/staff/me").then((r) => r.json());
  expect((await page.request.patch(`/api/v1/staff/admin/users/${me.id}`, { data: { isActive: false } })).status()).toBe(400);

  const key = await page.request.post("/api/v1/staff/admin/api-clients", { data: { name: "e2e admin client (synthetic)", scopes: ["assessments:read"] } });
  expect(key.status()).toBe(201);
  const k = await key.json();
  const list = await page.request.get("/api/v1/staff/admin/api-clients").then((r) => r.json());
  expect(JSON.stringify(list)).not.toContain(k.key.split(".")[1]); // the secret is never listed
  const asClient = () => request.get("/api/v1/integration/interactions/000000000000000000000000/assessment", { headers: { authorization: `ApiKey ${k.key}` } });
  expect((await asClient()).status()).toBe(404); // valid key, unknown interaction
  expect((await page.request.delete(`/api/v1/staff/admin/api-clients/${k.id}`)).status()).toBe(204);
  expect((await asClient()).status()).toBe(401); // revoked

  await page.goto("/admin");
  await expect(page.getByTestId("users")).toContainText("Test Officer");
});

test("scoring versions: invalid rejected, simulate, activate, auditor-only log with an intact chain (FR-SVI-06, FR-AUD-03)", async ({ page }) => {
  await staffLogin(page, "SYS_ADMIN");
  const list = await page.request.get("/api/v1/staff/admin/scoring-configs").then((r) => r.json());
  const active = list.items.find((c: { isActive: boolean }) => c.isActive) ?? list.items[0];
  test.skip(!active, "no stored scoring config (run the seed)");

  const bad = await page.request.post("/api/v1/staff/admin/scoring-configs", { data: { ...active.config, bandThresholds: { moderate: 60, high: 50, critical: 75 } } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).code).toBe("INVALID_CONFIG");

  const made = await page.request.post("/api/v1/staff/admin/scoring-configs", { data: { ...active.config, notes: "e2e copy (synthetic)" } });
  expect(made.status()).toBe(201);
  const { id, version } = await made.json();
  const sim = await page.request.post(`/api/v1/staff/admin/scoring-configs/${id}/simulate`).then((r) => r.json());
  expect(sim.scenarios).toBeGreaterThan(0);
  expect(sim.confusionMatrix).toHaveLength(4);
  expect(sim.bandAccuracy).toBeGreaterThanOrEqual(0);

  const act = await page.request.post(`/api/v1/staff/admin/scoring-configs/${id}/activate`).then((r) => r.json());
  expect(act.version).toBe(version);
  // Put the original version back.
  expect((await page.request.post(`/api/v1/staff/admin/scoring-configs/${active.id}/activate`)).status()).toBe(200);
  await withDb(async (db) => {
    expect(await db.collection("scoring_configs").countDocuments({ isActive: true })).toBe(1);
    expect((await db.collection("scoring_configs").findOne({ isActive: true }))!.version).toBe(active.version);
    await db.collection("scoring_configs").deleteOne({ version });
  });

  // Only the auditor reads the log.
  expect((await page.request.get("/api/v1/staff/admin/audit")).status()).toBe(403);
  await staffLogin(page, "AUDITOR");
  const log = await page.request.get("/api/v1/staff/admin/audit?action=scoringConfig.activate").then((r) => r.json());
  expect(log.items.length).toBeGreaterThan(0);
  await page.goto("/admin/audit");
  await page.getByTestId("verify-chain").click();
  await expect(page.getByTestId("verify-result")).toContainText("Intact", { timeout: 60_000 });
});
