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

test("a full interaction with a docket number: start → question and answers → SVI → recommendations → close (AC-API-01, FR-API-04, AC-CH-07)", async ({ request }) => {
  const c = api(request, await client(["interactions:write", "assessments:read", "stream:read"]));
  const docketNumber = `NHAA-2026-MH-${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const start = await c.post("/interactions", { channel: "PORTAL", language: "en", docketNumber, districtCode: "MH-PUN", externalRef: "e2e-1", consent });
  expect(start.status()).toBe(201);
  const s = await start.json();
  expect(s).toMatchObject({ docketNumber, mode: "TEXT_ONLY" });

  // Listen on the stream while the call goes on (FR-API-03).
  const streamP = c.get(`/interactions/${s.interactionId}/stream`);

  // NHAA's chatbot asks; the module stores the question as context and never scores it (AC-CH-07).
  const question = await c.post(`/interactions/${s.interactionId}/messages`, { text: "Are you thinking of ending your life?", sender: "OPERATOR" });
  expect(question.status()).toBe(201);
  expect((await question.json()).showEmergencyPanel).toBe(false);
  // No endpoint takes structured answers any more (FR-CH-01).
  expect((await c.post(`/interactions/${s.interactionId}/screeners`, { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 })).status()).toBe(404);
  const msg = await c.post(`/interactions/${s.interactionId}/messages`, { text: "They are standing outside the house now.", sender: "VICTIM" });
  expect(msg.status()).toBe(201);
  expect((await msg.json()).showEmergencyPanel).toBe(true);
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
    // The operator's words are kept but not scored as the caller's (AC-CH-07): the suicide question
    // asked by the chatbot produced no indicator.
    const ops = await db.collection("messages").find({ interactionId: i!._id, sender: "OPERATOR" }).toArray();
    expect(ops).toHaveLength(2);
    expect(await db.collection("indicators").countDocuments({ interactionId: i!._id, "evidence.messageId": { $in: ops.map((m) => m._id) } })).toBe(0);
    expect(await db.collection("indicators").countDocuments({ interactionId: i!._id, dimension: "SUICIDAL_IDEATION" })).toBe(0);
    const audit = await db.collection("audit_logs").findOne({ action: "interaction.start", entityId: s.interactionId });
    expect(audit!.actorType).toBe("API_CLIENT");
  });
});

test("indicators with evidence need the indicators:read scope; quotes are exact (M.5, FR-IND-04, rule 12)", async ({ request }) => {
  const reader = api(request, await client(["interactions:write", "assessments:read", "indicators:read"]));
  const start = await reader.post("/interactions", { channel: "CHATBOT", language: "en", consent });
  const { interactionId } = await start.json();
  const text = "They told my brother he will not live long if we go to court.";
  expect((await reader.post(`/interactions/${interactionId}/messages`, { text, sender: "VICTIM" })).status()).toBe(201);

  const res = await reader.get(`/interactions/${interactionId}/indicators`);
  expect(res.status()).toBe(200);
  expect(res.headers()["x-request-id"]).toMatch(/^req_/);
  const { items } = (await res.json()) as { items: { flags: string[]; evidence: { type: string; quote?: string; start?: number; end?: number } }[] };
  const spans = items.filter((i) => i.evidence.type === "TEXT_SPAN");
  expect(spans.length).toBeGreaterThan(0);
  for (const i of spans) {
    expect(text).toContain(i.evidence.quote!);
    expect(text.slice(i.evidence.start, i.evidence.end)).toBe(i.evidence.quote);
  }
  expect(items.some((i) => i.flags.includes("THREAT_TO_LIFE"))).toBe(true);
  for (const i of items) expect(Object.keys(i)).not.toContain("review");

  // Without the scope: 403. Another client: 404.
  const plain = api(request, await client(["interactions:write", "assessments:read"]));
  const own = (await (await plain.post("/interactions", { channel: "CHATBOT", language: "en", consent })).json()) as { interactionId: string };
  const refused = await plain.get(`/interactions/${own.interactionId}/indicators`);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe("SCOPE_MISSING");
  expect((await reader.get(`/interactions/${own.interactionId}/indicators`)).status()).toBe(404);
});

test("every integration response states the contract version; the input method is stored beside the modality (M.6, V2)", async ({ request }) => {
  // Errors carry the version too.
  const unauth = await api(request, null).post("/interactions", {});
  expect(unauth.status()).toBe(401);
  expect(unauth.headers()["x-contract-version"]).toBe("1.1");

  const c = api(request, await client(["interactions:write", "assessments:read"]));
  const start = await c.post("/interactions", { channel: "API", language: "en", consent });
  expect(start.headers()["x-contract-version"]).toBe("1.1");
  const { interactionId } = await start.json();
  const said = await c.post(`/interactions/${interactionId}/messages`, { text: "I am worried about the hearing next week.", inputMethod: "TRANSCRIPT" });
  expect(said.status()).toBe(201);
  expect(said.headers()["x-contract-version"]).toBe("1.1");
  expect((await c.post(`/interactions/${interactionId}/messages`, { text: "ok", inputMethod: "LIVE_AUDIO" })).status()).toBe(400);
  await withDb(async (db) => {
    const m = await db.collection("messages").findOne({ interactionId: new mongoose.Types.ObjectId(interactionId), sender: "VICTIM" });
    expect(m?.modality).toBe("TEXT");
    expect(m?.inputMethod).toBe("TRANSCRIPT");
  });
  // Staff routes are not part of the integration contract.
  expect((await request.get("/api/v1/staff/health")).headers()["x-contract-version"]).toBeUndefined();
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

test("withdrawing consent through the API stops analysis at once; the safety lexicon keeps running (AC-CON-04, FR-CON-04, rule 6)", async ({ request }) => {
  const c = api(request, await client(["interactions:write", "assessments:read"]));
  const start = await c.post("/interactions", { channel: "CHATBOT", language: "en", districtCode: "MH-PUN", consent });
  const { interactionId } = await start.json();
  await c.post(`/interactions/${interactionId}/messages`, { text: "Since the complaint I cannot sleep and I feel very low.", sender: "VICTIM" });
  const iid = new mongoose.Types.ObjectId(interactionId);
  const before = await withDb((db) => db.collection("assessments").countDocuments({ interactionId: iid }));
  expect(before).toBeGreaterThan(0);

  const w = await c.post(`/interactions/${interactionId}/consent/withdraw`, { reason: null });
  expect(w.status()).toBe(200);
  expect(await w.json()).toEqual({ mode: "SAFETY_ONLY", audioDeleted: true });

  // After withdrawal: no new SVI, but a life-safety statement still raises the band (rule 6).
  const r = await c.post(`/interactions/${interactionId}/messages`, { text: "They are standing outside my house right now.", sender: "VICTIM" });
  expect((await r.json()).showEmergencyPanel).toBe(true);
  await withDb(async (db) => {
    expect(await db.collection("assessments").countDocuments({ interactionId: iid })).toBe(before);
    const i = await db.collection("interactions").findOne({ _id: iid });
    expect(i!.mode).toBe("SAFETY_ONLY");
    expect(i!.consents.at(-1).action).toBe("WITHDRAWN");
    expect(await db.collection("audit_logs").countDocuments({ action: "consent.withdraw", entityId: interactionId })).toBe(1);
  });
});

test("a short answer is read with the question before it (AC-NLP-08, FR-NLP-11, task M.9)", async ({ request }) => {
  const c = api(request, await client(["interactions:write", "assessments:read"]));
  const start = async () => (await (await c.post("/interactions", { channel: "CHATBOT", language: "en", districtCode: "MH-PUN", consent })).json()).interactionId as string;

  // "No" right after the chatbot's "Are you safe right now?" → OV-9, at least High.
  const a = await start();
  await c.post(`/interactions/${a}/messages`, { text: "Are you safe right now?", sender: "OPERATOR" });
  await c.post(`/interactions/${a}/messages`, { text: "No", sender: "VICTIM" });
  const ra = await (await c.get(`/interactions/${a}/assessment`)).json();
  expect(ra.overridesFired).toContain("OV-9");
  expect(["HIGH", "CRITICAL"]).toContain(ra.band);

  // The same "No" after an unrelated question does not.
  const b = await start();
  await c.post(`/interactions/${b}/messages`, { text: "Did you get a copy of your complaint?", sender: "OPERATOR" });
  await c.post(`/interactions/${b}/messages`, { text: "No", sender: "VICTIM" });
  const rb = await (await c.get(`/interactions/${b}/assessment`)).json();
  expect(rb.overridesFired ?? []).not.toContain("OV-9");
  expect(rb.band).toBe("LOW");
});
