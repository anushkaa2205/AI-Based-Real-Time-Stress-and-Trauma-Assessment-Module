/**
 * Cached Mongoose connection for the assessment database `nhaa_assess`
 * (DATABASE.md §10.1). Serverless-safe: one connection per warm instance,
 * reused across hot reloads in development.
 */
import mongoose from "mongoose";
import { env } from "@/lib/env";

export const ASSESS_DB_NAME = "nhaa_assess";

const g = globalThis as unknown as { _mongo?: Promise<typeof mongoose> };

export function db(): Promise<typeof mongoose> {
  g._mongo ??= mongoose
    .connect(env().MONGODB_URI, {
      dbName: ASSESS_DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
      autoIndex: env().NODE_ENV !== "production", // indexes are synced by scripts/sync-indexes.ts
    })
    .catch((err: unknown) => {
      g._mongo = undefined; // allow a retry on the next request
      throw err;
    });
  return g._mongo;
}
