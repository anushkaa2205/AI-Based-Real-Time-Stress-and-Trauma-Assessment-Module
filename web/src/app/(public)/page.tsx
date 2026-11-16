/**
 * Home page (NIVARA_FLOW_AND_UI_PLAN.md §6.2, task N.6). Part of the demo input layer: it explains
 * the module and starts the demo. Never a score, band, indicator or staff screenshot (rule 1), and
 * no invented numbers, testimonials or logos (PRODUCT_VISION.md §9). With the demo off, the
 * starter and the track field are hidden and the module is unaffected (FR-API-05).
 */
import Link from "next/link";
import { ArrowRight, Code2, FileAudio2, MessageSquareText, Mic } from "lucide-react";
import { TrackForm } from "@/components/public/track-form";
import { demoEnabled } from "@/core/demo/client";

export const metadata = { title: "Nivara · Stress and trauma assessment for the 14566 helpline" };

const INPUTS = [
  { href: "/demo/text", icon: MessageSquareText, title: "Type a message", body: "Write as a person would in NHAA's chat.", testId: "start-text" },
  { href: "/demo/call", icon: Mic, title: "Speak", body: "Talk into your microphone, as on a helpline call.", testId: "start-call" },
  { href: "/demo/recording", icon: FileAudio2, title: "Play a recording", body: "Send a recorded call through the real audio path.", testId: "start-recording" },
] as const;

const STEPS = [
  { n: "01", title: "NHAA's own channel sends what the person said", body: "The chatbot, helpline, IVRS, app or operator desk keeps the conversation and the consent. It sends the text or the audio to Nivara through one integration API." },
  { n: "02", title: "Nivara reads the warning signs and works out urgency", body: "Safety rules run on every message, before and regardless of the AI. The AI finds indicators with the exact words as evidence; deterministic rules turn them into a stress vulnerability index and a risk band." },
  { n: "03", title: "Trained staff see the most urgent people first", body: "Counsellors get a queue in risk order with live alerts. Every action is a proposal until a human approves it. Police and welfare teams receive only the referral meant for them." },
] as const;

const ROLES = [
  ["Operator", "follows a live chat or call with suggested questions and the emergency state."],
  ["Counsellor", "works the queue in risk order, reads the evidence, approves or rejects support."],
  ["Supervisor", "everything a counsellor sees, plus the operator console and oversight."],
  ["District officer", "cases of their own district; decides police and protection proposals."],
  ["Police liaison", "only the approved referral: no narrative, no score."],
  ["Welfare officer", "only the approved welfare referral."],
] as const;

export default function HomePage() {
  const demoOn = demoEnabled();
  return (
    <>
      {/* Hero */}
      <section className="panel-night relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 -top-40 size-[34rem] rounded-full bg-brand/40 blur-3xl" />
          <div className="absolute -bottom-48 -left-24 size-[26rem] rounded-full bg-marigold/10 blur-3xl" />
        </div>
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-16 md:grid-cols-[1.15fr_0.85fr] md:items-center md:px-8 md:pb-28 md:pt-24">
          <div className="flex flex-col gap-6">
            <p className="rise eyebrow text-marigold">Assessment module for the NHAA helpline 14566</p>
            <h1 className="display rise rise-2 text-4xl text-white md:text-[3.5rem]">
              Hear the distress <span className="text-marigold">before</span> it is said in so many words.
            </h1>
            <p className="rise rise-3 max-w-xl text-lg leading-relaxed text-white/75">
              Nivara listens to what a person tells the helpline, in text or in their own voice, and tells trained staff who needs them first. It plugs into
              NHAA&apos;s existing systems; it never questions the person, and a human approves every action.
            </p>
            {!demoOn && (
              <div className="rise rise-3 flex flex-wrap gap-3">
                <Link href="/login" className="btn btn-accent">
                  Staff login <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href="/#how-it-works" className="btn btn-ghost-light">
                  How it works
                </Link>
              </div>
            )}
          </div>

          {demoOn && (
            <div className="rise rise-3 card card-raise flex flex-col gap-4 p-5 md:p-6" data-testid="demo-starter">
              <div>
                <p className="section-title">Try the demo</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">File a demo case as a caller would</h2>
                <p className="hint mt-1">Synthetic data only. You get a docket ID, never a score; staff see the assessment on their side.</p>
              </div>
              <ul className="flex flex-col gap-2">
                {INPUTS.map((m) => (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      data-testid={m.testId}
                      className="group flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3.5 no-underline transition-all hover:-translate-y-px hover:border-brand hover:shadow-raise"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                        <m.icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{m.title}</span>
                        <span className="block text-sm text-ink-2">{m.body}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-3">
                Already have a docket ID?{" "}
                <Link href="/track" className="link">
                  Track your case
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
        <p className="eyebrow">How it works</p>
        <h2 className="display mt-3 max-w-2xl text-3xl md:text-4xl">The module is the product. Everything else is a channel.</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3 border-t border-line pt-5">
              <span className="num text-sm text-brand">{s.n}</span>
              <h3 className="text-lg font-semibold leading-snug text-ink">{s.title}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 max-w-3xl text-sm text-ink-3">
          Two safety paths run independently: a rule-based safety lexicon on every message, and the AI analysis. If the AI is unavailable, the rules still run and the
          case is still registered. Scores, bands and warning signs are shown to staff only, never to the person.
        </p>
      </section>

      {/* Who sees what */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow">Who sees what</p>
              <h2 className="display mt-3 text-3xl md:text-4xl">One login, a portal for each role.</h2>
              <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-2">
                Each role signs in on the same page and lands on its own portal. What a role can read is enforced on the server, not only hidden on the screen.
              </p>
              <Link href="/login" className="btn btn-primary mt-6">
                Staff login <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {ROLES.map(([role, body]) => (
                <div key={role} className="border-l-2 border-brand-soft pl-4">
                  <dt className="font-semibold text-ink">{role}</dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-ink-2">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Track + integrators */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:px-8 md:py-24">
        {demoOn && (
          <div id="track" className="card card-pad flex flex-col gap-4 scroll-mt-20">
            <div>
              <p className="eyebrow">Track a case</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Where does my demo case stand?</h2>
              <p className="hint mt-1">Enter the docket ID you were given. You will see its status and the support arranged, nothing diagnostic.</p>
            </div>
            <TrackForm />
          </div>
        )}
        <div className={`flex flex-col gap-4 ${demoOn ? "" : "md:col-span-2"}`}>
          <p className="eyebrow">For integrators</p>
          <h2 className="text-2xl font-semibold text-ink">One API. Text and audio in, a structured assessment out.</h2>
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">
            Start an interaction with the consent the person gave, send messages or 5-second audio windows, read the assessment, the recommendations and, with the
            right scope, the indicators with their evidence. Keys carry scopes and rate limits; every response states the contract version.
          </p>
          <div>
            <Link href="/api/docs" className="btn btn-secondary">
              <Code2 className="size-4" aria-hidden /> Read the API documentation
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
