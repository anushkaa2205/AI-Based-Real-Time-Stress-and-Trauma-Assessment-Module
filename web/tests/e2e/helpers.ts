/** Shared helpers for end-to-end tests. Demo logins come from the git-ignored seed output; nothing is printed. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import mongoose from "mongoose";
import { generate } from "otplib";

process.loadEnvFile(resolve(__dirname, "../../.env.local"));

export interface DemoUser {
  role: string;
  email: string;
  password: string;
  totpSecret: string | null;
}

export function demoUser(role: string): DemoUser {
  const text = readFileSync(resolve(__dirname, "../../.seed-output/demo-credentials.txt"), "utf8");
  for (const block of text.split(/\n\s*\n/)) {
    if (!new RegExp(`^${role}\\s*$`, "m").test(block)) continue;
    const email = block.match(/email:\s+(\S+)/)?.[1];
    const password = block.match(/password:\s+(\S+)/)?.[1];
    const totp = block.match(/totp:\s+(otpauth:\S+)/)?.[1];
    if (email && password) return { role, email, password, totpSecret: totp ? new URL(totp).searchParams.get("secret") : null };
  }
  throw new Error(`No demo credentials for ${role}. Run: npm run seed -- --reset-totp`);
}

let ip = Math.floor(Math.random() * 200);
/** Each test client looks like a different address, so login and session rate limits are not shared. */
export function freshIp(): string {
  return `203.0.113.${(ip++ % 250) + 1}`;
}

/**
 * Signs a staff user in on the page's browser context (cookies are shared with page.request).
 * Counsellors and operators are put on duty, as they would be during a shift.
 */
export async function staffLogin(page: Page, role: string): Promise<void> {
  await signIn(page, role);
  if (role === "COUNSELLOR" || role === "OPERATOR") {
    const d = await page.request.patch("/api/v1/staff/me/duty", { data: { isOnDuty: true } });
    if (d.status() !== 200) throw new Error(`could not go on duty: ${d.status()}`);
  }
}

async function signIn(page: Page, role: string): Promise<void> {
  const u = demoUser(role);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  const r = await page.request.post("/api/v1/staff/auth/login", { data: { email: u.email, password: u.password } });
  if (r.status() !== 200) throw new Error(`login failed for ${role}: ${r.status()}`);
  if ((await r.json()).requiresTotp) {
    const t = await page.request.post("/api/v1/staff/auth/totp", { data: { code: await generate({ secret: u.totpSecret! }) } });
    if (t.status() !== 200) throw new Error(`TOTP failed for ${role}: ${t.status()}`);
  }
}

export type Lang = "en" | "hi" | "mr" | "ta" | "bn";

export interface Consent {
  textAnalysis: boolean;
  voiceAnalysis: boolean;
  shareWithCounsellor: boolean;
  followUpContact: boolean;
}

/** One synthetic API client per test run, with every integration scope. Removed by dropIntegrationKeys(). */
let keyPromise: Promise<string> | null = null;
const KEY_NAME = "e2e integration (synthetic)";

async function integrationKey(): Promise<string> {
  keyPromise ??= (async () => {
    // Same shape as `npm run api:client` writes (core/integration/apikey.ts).
    const { generateKey } = await import("../../src/core/integration/apikey");
    const k = generateKey();
    await withDb((db) =>
      db.collection("api_clients").insertOne({
        name: KEY_NAME,
        keyPrefix: k.prefix,
        keyHash: k.keyHash,
        scopes: ["interactions:write", "assessments:read", "stream:read", "indicators:read"],
        rateLimitPerMin: 600,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    return k.key;
  })();
  return keyPromise;
}

/** Call from test.afterAll in specs that use integrationSession(). */
export async function dropIntegrationKeys(): Promise<void> {
  await withDb((db) => db.collection("api_clients").deleteMany({ name: KEY_NAME }));
  keyPromise = null;
}

/**
 * An interaction started by a calling NHAA system through the integration API, the module's only
 * input (task M.2). `say` sends the person's words; `ask` sends a question from NHAA's chatbot or
 * operator, which is stored as context and never scored. Synthetic text only.
 */
export async function integrationSession(
  request: APIRequestContext,
  opts: { lang?: Lang; consent?: Partial<Consent>; channel?: string } = {},
) {
  const lang = opts.lang ?? "en";
  const key = await integrationKey();
  const headers = { authorization: `ApiKey ${key}` };
  const consent = { noticeVersion: "2026-11-v1", language: lang, textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false, ...opts.consent };
  const start = await request.post("/api/v1/integration/interactions", {
    data: { channel: opts.channel ?? "CHATBOT", language: lang, districtCode: "MH-PUN", consent },
    headers,
  });
  if (start.status() !== 201) throw new Error(`integration start failed: ${start.status()}`);
  const { interactionId, docketNumber } = (await start.json()) as { interactionId: string; docketNumber: string };
  const base = `/api/v1/integration/interactions/${interactionId}`;
  const call = (path: string, data: unknown, method: "post" | "put" = "post") => request[method](`${base}${path}`, { data, headers });
  return {
    interactionId,
    docketNumber,
    headers,
    base,
    call,
    say: (text: string) => call("/messages", { text, sender: "VICTIM" }),
    ask: (text: string) => call("/messages", { text, sender: "OPERATOR" }),
  };
}

export async function withDb<T>(fn: (db: mongoose.mongo.Db) => Promise<T>): Promise<T> {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI!, { dbName: "nhaa_assess" }).asPromise();
  try {
    return await fn(conn.db!);
  } finally {
    await conn.close();
  }
}
