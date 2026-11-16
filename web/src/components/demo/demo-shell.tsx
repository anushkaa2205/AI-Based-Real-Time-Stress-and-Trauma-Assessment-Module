import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import type { DemoPhase } from "./use-demo-case";

const STEPS: { key: DemoPhase; label: string }[] = [
  { key: "consent", label: "Consent" },
  { key: "input", label: "Your input" },
  { key: "registered", label: "Registered" },
];

function indexOf(phase: DemoPhase): number {
  return phase === "finishing" ? 1 : STEPS.findIndex((s) => s.key === phase);
}

/** The demo pages' frame (plan §6.3, §9.6): one centred column, the three-step indicator, the synthetic-data notice. */
export function DemoShell({ title, lead, phase, children }: { title: string; lead: string; phase: DemoPhase; children: React.ReactNode }) {
  const current = indexOf(phase);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 md:py-12">
      <div className="flex flex-col gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-2 no-underline hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> All demo inputs
        </Link>
        <h1 className="page-title">{title}</h1>
        <p className="page-lead">{lead}</p>
      </div>
      <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.key} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${done ? "bg-brand text-white" : active ? "border-2 border-brand text-brand" : "border border-line text-ink-3"}`}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={active ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3"}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line sm:w-10" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <DemoNotice />
      {children}
    </main>
  );
}

/** "Synthetic data only" marking shown on every demo page (PRODUCT_VISION.md §6, rule 11). */
export function DemoNotice() {
  return (
    <p role="note" className="rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-2 text-sm text-warn" data-testid="demo-notice">
      <span className="font-semibold">Demonstration.</span> Synthetic data only: do not enter real names, numbers or addresses. This page plays the part of an NHAA system and
      calls the module through its integration API.
    </p>
  );
}
