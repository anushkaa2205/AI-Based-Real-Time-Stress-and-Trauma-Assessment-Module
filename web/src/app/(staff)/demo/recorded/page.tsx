/** Demo mode 3, recorded audio library (tasks M.8, M.14). Off (404) unless DEMO_ENABLED; supervisors only. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { RecordedAudioDemo } from "@/components/demo/recorded-audio-demo";
import { demoEnabled } from "@/core/demo/client";
import { loadLibrary } from "@/core/demo/library";
import { requirePage } from "@/lib/staff-session";

export default async function Page() {
  await requirePage("demo");
  if (!demoEnabled()) notFound();
  const library = loadLibrary();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/demo" className="underline underline-offset-4">
              Demo input layer
            </Link>{" "}
            · Mode 3
          </p>
          <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Recorded audio library</h1>
        </div>
        <p className="text-sm text-ink-2">Plays a helpline call · POST /audio in 5 s windows</p>
      </div>
      <DemoBanner>
        Team recordings of synthetic scripts, never generated audio. The server cuts each file into 5-second windows and sends them to the module&apos;s audio endpoint in order, with
        the demo key. Cases are marked Demo on every staff screen.
      </DemoBanner>
      <RecordedAudioDemo library={library} />
    </section>
  );
}
