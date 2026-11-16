/** Demo mode 4, generated text (task M.13). Off (404) unless DEMO_ENABLED; supervisors only. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { GeneratedTextDemo } from "@/components/demo/generated-text-demo";
import { demoEnabled } from "@/core/demo/client";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("demo");
  if (!demoEnabled()) notFound();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/demo" className="underline underline-offset-4">
              Demo input layer
            </Link>{" "}
            · Mode 4
          </p>
          <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Generated text</h1>
        </div>
        <p className="text-sm text-ink-2">Plays NHAA&apos;s chatbot · POST /messages</p>
      </div>
      <DemoBanner>
        An LLM writes a synthetic conversation (free Groq quota). It is labelled synthetic, read before sending, and then played through the module&apos;s integration API with the
        demo key, one line at a time. Cases are marked Demo on every staff screen.
      </DemoBanner>
      <GeneratedTextDemo />
    </section>
  );
}
