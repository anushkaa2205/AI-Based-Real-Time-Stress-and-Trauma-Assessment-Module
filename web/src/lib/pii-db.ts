/**
 * Separate connection for the PII vault `nhaa_pii` (NFR-PRI-03, DATABASE.md §8.2).
 * Only `subject_identities` lives here, with its own credentials
 * (`MONGODB_PII_URI`). Nothing else may use this connection.
 */
import mongoose, { type Connection } from "mongoose";
import { env } from "@/lib/env";

export const PII_DB_NAME = "nhaa_pii";

const g = globalThis as unknown as { _piiConn?: Connection };

/** Returns the (lazily created) PII connection. Models can be registered before it opens. */
export function piiConnection(): Connection {
  g._piiConn ??= mongoose.createConnection(env().MONGODB_PII_URI, {
    dbName: PII_DB_NAME,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
    autoIndex: env().NODE_ENV !== "production",
  });
  return g._piiConn;
}

/** Resolves once the PII connection is open. */
export async function piiDb(): Promise<Connection> {
  return piiConnection().asPromise();
}
