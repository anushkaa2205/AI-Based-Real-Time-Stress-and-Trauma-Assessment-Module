/**
 * `npm run security:bundle` (task 9.5, AC-SEC-01): after `npm run build`, checks that no server
 * secret from .env.local appears in the JavaScript sent to browsers (.next/static).
 * Prints variable NAMES only, never values. Exit code 1 if anything leaks.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import "./load-env";

const SECRET_VARS = ["MONGODB_URI", "MONGODB_PII_URI", "ENCRYPTION_KEYS", "AUTH_SECRET", "ANALYSIS_HMAC_SECRET", "PUSHER_SECRET", "JOBS_SECRET", "PUSHER_APP_ID", "DEMO_API_KEY"];
const STATIC = resolve(__dirname, "../.next/static");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(js|json|css|html|map)$/.test(f) ? [p] : [];
  });
}

/** Values worth searching for: the whole value and, for JSON key maps, each key. */
function needles(name: string, value: string): string[] {
  const out = [value];
  if (name === "ENCRYPTION_KEYS") {
    try {
      out.push(...Object.values(JSON.parse(value) as Record<string, string>));
    } catch {
      /* not JSON */
    }
  }
  if (name.startsWith("MONGODB")) {
    const pw = /:\/\/[^:]+:([^@]+)@/.exec(value)?.[1];
    if (pw) out.push(pw);
  }
  return out.filter((n) => n.length >= 8);
}

const all = files(STATIC);
let leaks = 0;
for (const name of SECRET_VARS) {
  const value = process.env[name];
  if (!value) continue;
  const ns = needles(name, value);
  const hits = all.filter((f) => {
    const text = readFileSync(f, "utf8");
    return ns.some((n) => text.includes(n));
  });
  if (hits.length) {
    leaks++;
    console.error(`LEAK: ${name} appears in ${hits.length} client file(s)`);
  }
}
// Also: the secret variable names should not be referenced by client code at all.
const named = SECRET_VARS.filter((n) => all.some((f) => readFileSync(f, "utf8").includes(`process.env.${n}`)));
if (named.length) console.error(`client code references: ${named.join(", ")}`);
console.log(`${all.length} client files checked for ${SECRET_VARS.length} secrets: ${leaks ? `${leaks} LEAK(S)` : "no secret values found"}${named.length ? "" : ", no secret names referenced"}`);
process.exit(leaks || named.length ? 1 : 0);
