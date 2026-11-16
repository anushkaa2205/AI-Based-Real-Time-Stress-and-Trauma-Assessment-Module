/**
 * The integration API key for local scripts: INTEGRATION_API_KEY, or the newest
 * `.seed-output/api-client-*.txt` written by `npm run api:client`. Never printed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export function apiKey(): string {
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
