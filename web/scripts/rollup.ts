/**
 * `npm run stats:rollup -- --days 7` (task 8.2): recompute daily_stats for the last N days now,
 * instead of waiting for the hourly job (e.g. after seeding). Prints counts only.
 */
import "./load-env";
import mongoose from "mongoose";
import { rollupDay } from "@/core/analytics/rollup";
import { db } from "@/lib/db";

const arg = process.argv.indexOf("--days");
const days = arg > 0 ? Math.max(1, Math.min(400, Number(process.argv[arg + 1]) || 1)) : 1;

async function main() {
  await db();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000);
    const r = await rollupDay(day, now);
    console.log(`${day.toISOString().slice(0, 10)}: ${r.interactions} interactions → ${r.rows} rows`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(`rollup failed: ${(err as Error)?.name ?? "Error"}`);
  process.exit(1);
});
