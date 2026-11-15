/**
 * Integration API (task 8.4): AC-API-01, AC-API-02, FR-API-03/04. Clients and keys are created
 * in the test and removed afterwards. Synthetic text only.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import mongoose from "mongoose";
import { generateKey } from "../../src/core/integration/apikey";
import { withDb } from "./helpers";

test.describe.configure({ mode: "serial" });

const made: string[] = [];
async function client(scopes: string[], rateLimitPerMin = 120) {
  const k = generateKey();
  await withDb((db) => db.collection("api_clients").insertOne({ name: "e2e (synthetic)", keyPrefix: k.prefix, keyHash: k.keyHash, scopes, rateLimitPerMin, isActive: true, createdAt: new Date(), updatedAt: new Date() }));
  made.push(k.prefix);
  return k.key;
}
test.afterAll(() => withDb((db) => db.collection("api_clients").deleteMany({ keyPrefix: { $in: made } })));

const consent = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false };
const api = (request: APIRequestContext, key: string | null) => ({
  post: (path: string, data: unknown) => request.post(`/api/v1/integration${path}`, { data, headers: key ? { authorization: `ApiKey ${key}` } : {} }),
  get: (path: string) => request.get(`/api/v1/integration${path}`, { headers: key ? { authorization: `ApiKey ${key}` } : {} }),
});

test("a full interaction with a docket number: start → answers → message → SVI → recommendations → close (AC-API-01, FR-API-04)", async ({ request }) => {
  const c = api(request, await client(["interactions:write", "assessments:read", "stream:read"]));
  const docketNumber = `NHAA-2026-MH-${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const start = await c.post("/interactions", { channel: "PORTAL", language: "en", docketNumber, districtCode: "MH-PUN", externalRef: "e2e-1", consent });
  expect(start.status()).toBe(201);
  const s = await start.json();
  expect(s).toMatchObject({ docketNumber, mode: "TEXT_ONLY" });

  // Listen on the stream while the call goes on (FR-API-03).
  const streamP = c.get(`/interactions/${s.interactionId}/stream`);

  expect((await c.post(`/interactions/${s.interactionId}/screeners`, { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 })).status()).toBe(201);
  const crit = await c.post(`/interactions/${s.interactionId}/screeners`, { instrument: "SAFETY_CHECK", itemCode: "SAFETY_ACCUSED_NEARBY", value: 1 });
  expect((await crit.json()).showEmergencyPanel).toBe(true);
  const msg = await c.post(`/interactions/${s.interactionId}/messages`, { text: "They are standing outside the house now.", sender: "VICTIM" });
  expect(msg.status()).toBe(201);
  expect((await c.post(`/interactions/${s.interactionId}/messages`, { text: "Caller sounds out of breath.", sender: "OPERATOR" })).status()).toBe(201);

  const a = await (await c.get(`/interactions/${s.interactionId}/assessment`)).json();
  expect(a.band).toBe("CRITICAL");
  expect(a.overridesFired).toContain("OV-2");
  expect(typeof a.svi).toBe("number");
  const recs = await (await c.get(`/interactions/${s.interactionId}/recommendations`)).json();
  expect(recs.items.map((r: { type: string }) => r.type)).toEqual(expect.arrayContaining(["EMERGENCY_SUPPORT", "POLICE_INTERVENTION"]));

  // The stream closes by itself after ~55 s; its frames are already in by then.
  const frames = await (await streamP).text();
  expect(frames).toContain("event: assessment.updated");
  expect(frames).toContain("event: emergency.show");
  expect(frames).toContain("event: recommendation.created");

  expect((await c.post(`/interactions/${s.interactionId}/end`, { reason: "COMPLETED" })).status()).toBe(200);
  await withDb(async (db) => {
    const i = await db.collection("interactions").findOne({ _id: new mongoose.Types.ObjectId(s.interactionId) });
    expect(i!.externalRef).toBe("e2e-1");
    expect(i!.status).toBe("ENDED");
    // The operator's words are kept but not scored as the caller's.
    const op = await db.collection("messages").findOne({ interactionId: i!._id, sender: "OPERATOR" });
    expect(op).toBeTruthy();
    const audit = await db.collection("audit_logs").findOne({ action: "interaction.start", entityId: s.interactionId });
    expect(audit!.actorType).toBe("API_CLIENT");
  });
});

test("keys, scopes, ownership and rate limits (AC-API-02)", async ({ request }) => {
  const writeOnly = await client(["interactions:write"], 4);
  const other = await client(["interactions:write", "assessments:read"]);

  // No key, malformed key, wrong secret → 401.
  expect((await api(request, null).post("/interactions", {})).status()).toBe(401);
  expect((await api(request, "not-a-key").post("/interactions", {})).status()).toBe(401);
  const [prefix] = writeOnly.split(".");
  const wrong = await api(request, `${prefix}.${"x".repeat(43)}`).post("/interactions", {});
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).code).toBe("INVALID_API_KEY");

  const w = api(request, writeOnly);
  const start = await w.post("/interactions", { channel: "IVRS", language: "hi", consent: { ...consent, language: "hi" } });
  expect(start.status()).toBe(201);
  const { interactionId } = await start.json();

  // Missing scope → 403 SCOPE_MISSING.
  const noScope = await w.get(`/interactions/${interactionId}/assessment`);
  expect(noScope.status()).toBe(403);
  expect((await noScope.json()).code).toBe("SCOPE_MISSING");

  // Another client's interaction → 404 (it cannot even learn it exists).
  expect((await api(request, other).get(`/interactions/${interactionId}/assessment`)).status()).toBe(404);

  // Over the per-key limit → 429. The limit counts per minute, so with 2/min, five calls trip it
  // even if they straddle a minute boundary.
  const limited = api(request, await client(["assessments:read"], 2));
  const statuses: number[] = [];
  for (let n = 0; n < 5; n++) statuses.push((await limited.get(`/interactions/${interactionId}/assessment`)).status());
  expect(statuses).toContain(429);
});
