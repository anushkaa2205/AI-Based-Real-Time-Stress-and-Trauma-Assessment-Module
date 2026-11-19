/**
 * `npm run api:client -- --name "Partner system" [--scopes interactions:write,assessments:read,stream:read] [--rpm 120]`
 * (task 8.4). Creates an integration client. The key is shown once: it is written to the
 * git-ignored `.seed-output/api-client-<prefix>.txt`, never printed or logged.
 *
 * `npm run api:client -- --portal` (task M.7) creates the portal's client (`isPortal: true`,
 * so everything it creates is tagged as a portal case) and writes `PORTAL_API_KEY` and `PORTAL_ENABLED=true` into the
 * git-ignored `.env.local` instead. Restart the dev server afterwards.
 *
 * `npm run api:client -- --update-portal-scopes` (task P.3) gives every active portal client all current
 * scopes (status:read, questions:read, …) without issuing a new key, so PORTAL_API_KEY keeps working.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "./load-env";
import mongoose from "mongoose";
import { generateKey, SCOPES, type Scope } from "@/core/integration/apikey";
import { db } from "@/lib/db";
import { ApiClient } from "@/models";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Sets (or adds) `NAME=value` lines in an env file, keeping every other line as it is. */
function setEnvLines(file: string, values: Record<string, string>) {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  writeFileSync(file, `${lines.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
}

async function main() {
  if (process.argv.includes("--update-portal-scopes")) {
    await db();
    const r = await ApiClient.updateMany({ isPortal: true, isActive: true }, { $addToSet: { scopes: { $each: [...SCOPES] } } });
    console.log(`Updated ${r.modifiedCount} portal client(s) to scopes: ${SCOPES.join(", ")}.`);
    await mongoose.disconnect();
    return;
  }
  const portal = process.argv.includes("--portal");
  const name = arg("name") ?? (portal ? "Nivara portal" : "Integration client");
  const scopes = (arg("scopes") ?? SCOPES.join(",")).split(",").map((s) => s.trim()) as Scope[];
  for (const s of scopes) if (!SCOPES.includes(s)) throw new Error(`Unknown scope: ${s}`);
  const rpm = Math.max(1, Math.min(10_000, Number(arg("rpm") ?? 120)));
  await db();
  const k = generateKey();
  await ApiClient.create({ name, keyPrefix: k.prefix, keyHash: k.keyHash, scopes, rateLimitPerMin: rpm, isActive: true, isPortal: portal });
  if (portal) {
    setEnvLines(resolve(__dirname, "../.env.local"), { PORTAL_ENABLED: "true", PORTAL_API_KEY: k.key });
    console.log(`Created the portal client ${k.prefix}. PORTAL_API_KEY and PORTAL_ENABLED=true are in .env.local; restart the dev server.`);
    await mongoose.disconnect();
    return;
  }
  const dir = resolve(__dirname, "../.seed-output");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `api-client-${k.prefix}.txt`);
  writeFileSync(file, `name: ${name}\nscopes: ${scopes.join(",")}\nrate limit/min: ${rpm}\nkey: ${k.key}\n`, { mode: 0o600 });
  console.log(`Created client ${k.prefix} (${scopes.join(", ")}). The key is in .seed-output/api-client-${k.prefix}.txt`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(`could not create the client: ${(err as Error)?.message ?? "error"}`);
  process.exit(1);
});
