/**
 * `npm run api:example -- [--base http://localhost:3000]` (task 8.4, AC-API-01).
 * Runs a full interaction through the integration API with a docket number:
 * start (with consent) → safety answers → message → SVI → recommendations → close.
 * The key comes from INTEGRATION_API_KEY or the newest `.seed-output/api-client-*.txt`.
 * Synthetic text only. Prints statuses and the SVI/band (this is a staff-side integration).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

function apiKey(): string {
  if (process.env.INTEGRATION_API_KEY) return process.env.INTEGRATION_API_KEY;
  const dir = resolve(__dirname, "../.seed-output");
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("api-client-"))
    .map((f) => resolve(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const key = files[0] ? /key:\s+(\S+)/.exec(readFileSync(files[0], "utf8"))?.[1] : undefined;
  if (!key) throw new Error("No API key. Run: npm run api:client -- --name \"Demo\"");
  return key;
}

const i = process.argv.indexOf("--base");
const BASE = (i > 0 ? process.argv[i + 1] : undefined) ?? "http://localhost:3000";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/v1/integration${path}`, {
    method,
    headers: { authorization: `ApiKey ${apiKey()}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`${method} ${path.replace(/[a-f0-9]{24}/, "{id}")} → ${res.status}`);
  if (!res.ok) throw new Error(`${res.status} ${String(data.code ?? "")}`);
  return data;
}

async function main() {
  const year = new Date().getUTCFullYear();
  const docketNumber = `NHAA-${year}-MH-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const start = await call("POST", "/interactions", {
    channel: "PORTAL",
    language: "en",
    docketNumber,
    districtCode: "MH-PUN",
    externalRef: "example-script",
    consent: { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false },
  });
  const id = String(start.interactionId);
  console.log(`  docket ${String(start.docketNumber)}, mode ${String(start.mode)}`);
  await call("POST", `/interactions/${id}/screeners`, { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 });
  await call("POST", `/interactions/${id}/screeners`, { instrument: "SAFETY_CHECK", itemCode: "SAFETY_ACCUSED_NEARBY", value: 0 });
  await call("POST", `/interactions/${id}/messages`, { text: "Since the complaint the village shop will not sell to us and I cannot sleep.", sender: "VICTIM" });
  const a = await call("GET", `/interactions/${id}/assessment`);
  console.log(`  SVI ${String(a.svi)}, band ${String(a.band)}`);
  const r = await call("GET", `/interactions/${id}/recommendations`);
  console.log(`  ${(r.items as unknown[]).length} recommendation(s)`);
  await call("POST", `/interactions/${id}/end`, { reason: "COMPLETED" });
  console.log("Full interaction completed.");
}

main().catch((err) => {
  console.error(`example failed: ${(err as Error).message}`);
  process.exit(1);
});
