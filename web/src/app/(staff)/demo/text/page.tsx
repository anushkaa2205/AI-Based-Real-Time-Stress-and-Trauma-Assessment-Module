/** Demo mode 1, live text (task M.11). Off (404) unless DEMO_ENABLED; supervisors only. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { LiveTextDemo, type TextScenario } from "@/components/demo/live-text-demo";
import { VICTIM_LANGS } from "@/contracts/interaction";
import { demoEnabled } from "@/core/demo/client";
import { loadLibrary } from "@/core/demo/library";
import { MESSAGES } from "@/core/i18n/messages";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("demo");
  if (!demoEnabled()) notFound();
  const scenarios: TextScenario[] = loadLibrary().map((s) => ({ id: s.id, title: s.title, languageTag: s.languageTag, language: s.language, script: s.script, expected: s.expected }));
  // NHAA's scripted, pre-translated questions (messages/*.json): the chatbot asks them, never the module.
  const questions = Object.fromEntries(
    VICTIM_LANGS.map((l) => [l, Object.entries(MESSAGES[l].operatorQuestions as Record<string, string>).map(([key, text]) => ({ key, text }))]),
  ) as Record<(typeof VICTIM_LANGS)[number], { key: string; text: string }[]>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/demo" className="underline underline-offset-4">
              Demo input layer
            </Link>{" "}
            · Mode 1
          </p>
          <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Live text</h1>
        </div>
        <p className="text-sm text-ink-2">Plays NHAA&apos;s chatbot · POST /messages</p>
      </div>
      <DemoBanner />
      <LiveTextDemo scenarios={scenarios} questions={questions} />
    </section>
  );
}
