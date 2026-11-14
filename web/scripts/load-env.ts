/**
 * Loads web/.env.local for command-line scripts (Next.js loads it for the app).
 * Uses Node's built-in loader; values are never printed.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), ".env.local");
if (existsSync(file)) {
  process.loadEnvFile(file);
}
