/**
 * Neutral case summary for responders (task 4.9, FR-NLP-09, FR-CH-10).
 * Runs after the interaction ends, only with text-analysis consent. Text is
 * decrypted in memory, redacted before it leaves the app, and the summary is
 * stored encrypted. Best effort: failures are logged by type only.
 */
import { randomUUID } from "node:crypto";
import { summarizeCase } from "@/core/analysis-client/client";
import { allowsTextAnalysis } from "@/core/consent/mode";
import { decrypt, encrypt } from "@/core/privacy/crypto";
import { redact } from "@/core/privacy/redact";
import { db } from "@/lib/db";
import { Case, Interaction, Message } from "@/models";

export async function summarizeInteraction(interactionId: string): Promise<"stored" | "skipped" | "degraded"> {
  try {
    await db();
    const interaction = await Interaction.findById(interactionId).select("caseId mode uiLanguage").lean();
    if (!interaction || !allowsTextAnalysis(interaction.mode)) return "skipped";
    const messages = await Message.find({ interactionId, sender: "VICTIM" }).sort({ seq: 1 }).select("textEnc").lean();
    if (!messages.length) return "skipped";

    const res = await summarizeCase({
      requestId: randomUUID(),
      language: interaction.uiLanguage,
      messages: messages.map((m) => ({ sender: "VICTIM", text: redact(decrypt(m.textEnc)).text })),
    });
    if (res.degraded) {
      console.warn(`[summary] analysis degraded (${res.reason}); no summary stored`);
      return "degraded";
    }
    await Case.updateOne(
      { _id: interaction.caseId },
      { $set: { summaryEnc: encrypt(res.result.summary), summaryTranslatedEnc: encrypt(res.result.summaryEn) } },
    );
    return "stored";
  } catch (err) {
    console.error(`[summary] failed: ${(err as Error)?.name ?? "Error"}`);
    return "degraded";
  }
}
