/**
 * `npm run db:indexes` (task 1.2, DATABASE.md §10.2): runs syncIndexes() on
 * every model, including the PII vault on its own connection. Run on deploy.
 * Prints model names and index counts only.
 */
import "./load-env";
import mongoose from "mongoose";
import { db } from "@/lib/db";
import { piiDb } from "@/lib/pii-db";
import { ASSESS_MODELS } from "@/models";
import { SubjectIdentity } from "@/models/subject-identity";

async function main() {
  await db();
  let failed = 0;
  for (const model of ASSESS_MODELS) {
    try {
      const dropped = await model.syncIndexes();
      const indexes = await model.listIndexes();
      console.log(`ok   ${model.modelName.padEnd(16)} ${indexes.length} indexes${dropped.length ? `, dropped ${dropped.length}` : ""}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${model.modelName}: ${(err as Error).message}`);
    }
  }

  const pii = await piiDb();
  try {
    const model = SubjectIdentity();
    await model.syncIndexes();
    console.log(`ok   ${model.modelName.padEnd(16)} ${(await model.listIndexes()).length} indexes (PII database)`);
  } catch (err) {
    failed++;
    console.error(`FAIL SubjectIdentity: ${(err as Error).message}`);
  }

  await pii.close();
  await mongoose.disconnect();
  if (failed) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(`sync-indexes failed: ${(err as Error).message}`);
  process.exit(1);
});
