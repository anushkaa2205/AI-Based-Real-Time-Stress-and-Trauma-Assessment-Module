/** Demo input 1, type a message (plan §6.3). Public; off (404) unless DEMO_ENABLED. */
import { notFound } from "next/navigation";
import { LiveTextDemo, type TextScenario } from "@/components/demo/live-text-demo";
import { VICTIM_LANGS } from "@/contracts/interaction";
import { demoEnabled } from "@/core/demo/client";
import { listDistricts } from "@/core/demo/districts";
import { loadLibrary } from "@/core/demo/library";
import { MESSAGES } from "@/core/i18n/messages";

export const metadata = { title: "Type a message" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!demoEnabled()) notFound();
  // Expected labels are test metadata: they stay on the server (plan §6.3).
  const scenarios: TextScenario[] = loadLibrary().map((s) => ({ id: s.id, title: s.title, languageTag: s.languageTag, language: s.language, script: s.script }));
  // NHAA's scripted, pre-translated questions (messages/*.json): the chatbot asks them, never the module (rule 2).
  const questions = Object.fromEntries(
    VICTIM_LANGS.map((l) => [l, Object.entries(MESSAGES[l].operatorQuestions as Record<string, string>).map(([key, text]) => ({ key, text }))]),
  ) as Record<(typeof VICTIM_LANGS)[number], { key: string; text: string }[]>;
  return <LiveTextDemo scenarios={scenarios} questions={questions} districts={await listDistricts()} />;
}
