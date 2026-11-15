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

/** A victim session driven over the API (synthetic text only). */
export async function victimSession(request: APIRequestContext, lang: "en" | "hi" = "en") {
  const headers = { "x-forwarded-for": freshIp() };
  const start = await request.post("/api/v1/victim/interactions", { data: { channel: "CHATBOT", language: lang, districtCode: "MH-PUN" }, headers });
  const { interactionId, docketNumber } = await start.json();
  const call = (path: string, data: unknown, method: "post" | "put" = "post") =>
    request[method](`/api/v1/victim/interactions/${interactionId}${path}`, { data, headers });
  return { interactionId: interactionId as string, docketNumber: docketNumber as string, call, headers };
}

export async function withDb<T>(fn: (db: mongoose.mongo.Db) => Promise<T>): Promise<T> {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI!, { dbName: "nhaa_assess" }).asPromise();
  try {
    return await fn(conn.db!);
  } finally {
    await conn.close();
  }
}
