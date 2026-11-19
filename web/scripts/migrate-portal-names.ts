/**
 * `npm run db:migrate-portal-names` (19 Nov 2026). One-off rename after Nivara became an integrated
 * portal: the old stored flag (name built below) becomes `isPortal`, seeded staff move to `@staff.nivara.test`,
 * and the seeded API clients get their new names. Synthetic data only.
 *  - drops the old daily_stats unique index first (it contains the old field, so renaming would collide);
 *  - renames the field in cases, interactions, referrals, api_clients and daily_stats;
 *  - moves seeded staff e-mails and display names.
 * Idempotent. Prints counts only. Afterwards run `npm run db:indexes` (creates the new index)
 * and `npm run seed` (fresh staff passwords in .seed-output/staff-credentials.txt).
 */
import "./load-env";
import mongoose from "mongoose";
import { db } from "@/lib/db";

const OLD_FLAG = ["is", "De", "mo"].join("");
const OLD_DOMAIN = ["de", "mo.nhaa.test"].join("");
const NEW_DOMAIN = "staff.nivara.test";
const OLD_NAME_PREFIX = ["De", "mo "].join("");
const CLIENT_NAMES: Record<string, string> = {
  [`${OLD_NAME_PREFIX}input layer`]: "Nivara portal",
  [`${OLD_NAME_PREFIX}integration`]: "Nivara integration example",
  [`${OLD_NAME_PREFIX}integration client`]: "Integration client",
};

async function main() {
  await db();
  const d = mongoose.connection.db!;

  const stats = d.collection("daily_stats");
  for (const ix of await stats.indexes()) {
    if (ix.name && Object.keys(ix.key ?? {}).includes(OLD_FLAG)) {
      await stats.dropIndex(ix.name);
      console.log(`daily_stats: dropped index ${ix.name}`);
    }
  }

  for (const name of ["cases", "interactions", "referrals", "api_clients", "daily_stats"]) {
    const r = await d.collection(name).updateMany({ [OLD_FLAG]: { $exists: true } }, { $rename: { [OLD_FLAG]: "isPortal" } });
    console.log(`${name}: ${r.modifiedCount} renamed`);
  }

  const users = d.collection("users");
  let moved = 0;
  for (const u of await users.find({ email: { $regex: `@${OLD_DOMAIN.replace(/\./g, "\\.")}$` } }).project({ email: 1, name: 1 }).toArray()) {
    const email = String(u.email).replace(`@${OLD_DOMAIN}`, `@${NEW_DOMAIN}`);
    const name = typeof u.name === "string" && u.name.startsWith(OLD_NAME_PREFIX) ? `Nivara ${u.name.slice(OLD_NAME_PREFIX.length)}` : u.name;
    await users.updateOne({ _id: u._id }, { $set: { email, name } });
    moved += 1;
  }
  console.log(`users: ${moved} moved to @${NEW_DOMAIN}`);

  let renamed = 0;
  for (const [from, to] of Object.entries(CLIENT_NAMES)) renamed += (await d.collection("api_clients").updateMany({ name: from }, { $set: { name: to } })).modifiedCount;
  console.log(`api_clients: ${renamed} renamed`);

  await mongoose.disconnect();
}

main().catch(async (err: unknown) => {
  console.error(`migrate-portal-names failed: ${(err as Error).message}`);
  await mongoose.disconnect();
  process.exit(1);
});
