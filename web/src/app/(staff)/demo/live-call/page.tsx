/** Demo mode 2, live microphone (task M.12). Off (404) unless DEMO_ENABLED; supervisors only. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { LiveCallDemo } from "@/components/demo/live-call-demo";
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
            · Mode 2
          </p>
          <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Live microphone</h1>
        </div>
        <p className="text-sm text-ink-2">Plays a helpline call · POST /audio every 5 s</p>
      </div>
      <DemoBanner>
        You speak as the caller, with a synthetic story. Your voice goes to the module&apos;s audio endpoint in 5-second windows, with the demo key, and is never stored. The
        call is marked Demo on every staff screen.
      </DemoBanner>
      <LiveCallDemo />
    </section>
  );
}
