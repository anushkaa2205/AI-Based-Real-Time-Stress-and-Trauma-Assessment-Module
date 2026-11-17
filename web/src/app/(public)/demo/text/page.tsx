/** Demo input 1, type a message (plan §6.3). Public; off (404) unless DEMO_ENABLED. */
import { notFound } from "next/navigation";
import { LiveTextDemo } from "@/components/demo/live-text-demo";
import { VICTIM_LANGS } from "@/contracts/interaction";
import { demoEnabled } from "@/core/demo/client";
import { listDistricts } from "@/core/demo/districts";
import { MESSAGES } from "@/core/i18n/messages";

export const metadata = { title: "Type a message" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!demoEnabled()) notFound();
  // NHAA's scripted, pre-translated questions (messages/*.json): the chatbot asks them, never the module (rule 2).
  const questions = Object.fromEntries(
    VICTIM_LANGS.map((l) => [l, Object.entries(MESSAGES[l].operatorQuestions as Record<string, string>).map(([key, text]) => ({ key, text }))]),
  ) as Record<(typeof VICTIM_LANGS)[number], { key: string; text: string }[]>;
  return <LiveTextDemo questions={questions} districts={await listDistricts()} />;
}
