/**
 * Demo input layer: choose a mode (PRODUCT_VISION.md §6, tasks M.11 and M.14).
 * Off (404) unless DEMO_ENABLED; supervisors only (`demo.use`).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBanner } from "@/components/demo/demo-banner";
import { demoEnabled } from "@/core/demo/client";
import { loadLibrary } from "@/core/demo/library";
import { requirePage } from "@/lib/staff-session";

const MODES = [
  {
    n: 1,
    href: "/demo/text",
    title: "Live text",
    represents: "NHAA chatbot",
    path: "POST /messages, one message at a time",
    body: "Type as the person. Ask NHAA's scripted questions as the chatbot; their answers are read with the question. Replay a scenario's text version line by line.",
  },
  {
    n: 3,
    href: "/demo/recorded",
    title: "Recorded audio library",
    represents: "Helpline call, repeatable",
    path: "POST /audio, 5 s windows cut on the server",
    body: "Plays a team recording of a scenario through the real audio path. Two voices on one track are separated; only the caller's words are scored.",
  },
] as const;

const PLANNED = [
  { n: 2, title: "Live microphone", represents: "Helpline call", note: "Task M.12" },
  { n: 4, title: "Generated text", represents: "Synthetic chatbot conversations", note: "Task M.13" },
] as const;

export default async function Page() {
  await requirePage("demo");
  if (!demoEnabled()) notFound();
  const library = loadLibrary();
  const recorded = library.filter((s) => s.recordingAvailable).length;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-[1.375rem] font-bold leading-tight text-ink">Demo input layer</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Each mode stands in for one of NHAA&apos;s own systems. They all call the same module through the same integration API, and every case lands in the staff dashboards in risk
          order, marked Demo.
        </p>
      </div>
      <DemoBanner />

      <div className="grid gap-4 md:grid-cols-2">
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className="card group flex flex-col gap-3 p-5 no-underline transition-colors hover:border-navy" data-testid={`mode-${m.n}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs font-semibold text-muted-foreground">Mode {m.n}</span>
              <span className="text-xs text-muted-foreground">{m.represents}</span>
            </div>
            <h2 className="text-lg font-bold text-ink group-hover:text-navy">{m.title}</h2>
            <p className="text-sm leading-relaxed text-ink-2">{m.body}</p>
            <p className="mt-auto border-t border-line pt-3 font-mono text-xs text-ink-2">{m.path}</p>
            {m.n === 3 && (
              <p className="text-xs text-muted-foreground">
                {recorded} of {library.length} library scenarios recorded
              </p>
            )}
            <span className="text-sm font-semibold text-navy underline-offset-4 group-hover:underline">Open {m.title.toLowerCase()} →</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PLANNED.map((m) => (
          <div key={m.n} className="flex items-center justify-between gap-3 border border-dashed border-line px-5 py-3 text-sm text-muted-foreground">
            <span>
              <span className="mr-2 font-mono text-xs">Mode {m.n}</span>
              <strong className="font-semibold text-ink-2">{m.title}</strong> · {m.represents}
            </span>
            <span className="text-xs">Not built yet ({m.note})</span>
          </div>
        ))}
      </div>

      <div className="card p-5 text-sm text-ink-2">
        <h2 className="section-title mb-2">How a demo case flows</h2>
        <ol className="grid gap-3 md:grid-cols-4">
          {[
            ["This page", "plays an NHAA system and holds the demo key on the server."],
            ["Integration API", "the module's only input: consent, text and audio windows."],
            ["The module", "safety rules, AI analysis, SVI, band, overrides, proposals."],
            ["Staff dashboards", "queue in risk order, approvals, referrals; marked Demo."],
          ].map(([t, d], i) => (
            <li key={t} className="border-l-[3px] border-navy pl-3">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              <p className="font-semibold text-ink">{t}</p>
              <p className="text-xs leading-relaxed">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
