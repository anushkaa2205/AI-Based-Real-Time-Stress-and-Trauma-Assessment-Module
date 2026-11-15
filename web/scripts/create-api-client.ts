/**
 * `npm run api:client -- --name "Portal (demo)" [--scopes interactions:write,assessments:read,stream:read] [--rpm 120]`
 * (task 8.4). Creates an integration client. The key is shown once: it is written to the
 * git-ignored `.seed-output/api-client-<prefix>.txt`, never printed or logged.
 */
import { mkdirSync, writeFileSync } from "node:fs";
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

async function main() {
  const name = arg("name") ?? "Demo integration client";
  const scopes = (arg("scopes") ?? SCOPES.join(",")).split(",").map((s) => s.trim()) as Scope[];
  for (const s of scopes) if (!SCOPES.includes(s)) throw new Error(`Unknown scope: ${s}`);
  const rpm = Math.max(1, Math.min(10_000, Number(arg("rpm") ?? 120)));
  await db();
  const k = generateKey();
  await ApiClient.create({ name, keyPrefix: k.prefix, keyHash: k.keyHash, scopes, rateLimitPerMin: rpm, isActive: true });
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
