/**
 * `npm run db:drop-screener-data` (task M.3, DATABASE.md §4.2). One-off clean-up after the question
 * flow and screeners were removed (PRODUCT_VISION.md §5). Synthetic data only.
 *  - removes screener answers/scores, flow state and victim-session fields from `interactions`;
 *  - deletes indicators with source SCREENER or SCREENER_ANSWER evidence (config v3 has no such source);
 *  - removes `promptKey` from `messages`.
 * Idempotent. Prints counts only. Run `npm run db:indexes` afterwards to drop the old token index,
 * and `npm run seed` to activate scoring config v3.
 */
import "./load-env";
import mongoose from "mongoose";
import { db } from "@/lib/db";

async function main() {
  await db();
  const d = mongoose.connection.db!;
  const interactions = await d.collection("interactions").updateMany(
    {
      $or: [
        { screenerResponses: { $exists: true } },
        { screenerScores: { $exists: true } },
        { flowState: { $exists: true } },
        { sessionTokenHash: { $exists: true } },
        { sessionExpiresAt: { $exists: true } },
      ],
    },
    { $unset: { screenerResponses: "", screenerScores: "", flowState: "", sessionTokenHash: "", sessionExpiresAt: "" } },
  );
  const indicators = await d.collection("indicators").deleteMany({ $or: [{ source: "SCREENER" }, { "evidence.type": "SCREENER_ANSWER" }] });
  const messages = await d.collection("messages").updateMany({ promptKey: { $exists: true } }, { $unset: { promptKey: "" } });
  console.log(`interactions cleaned: ${interactions.modifiedCount}`);
  console.log(`screener indicators deleted: ${indicators.deletedCount}`);
  console.log(`messages cleaned: ${messages.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`clean-up failed: ${(err as Error).name}`);
  await mongoose.disconnect();
  process.exit(1);
});
