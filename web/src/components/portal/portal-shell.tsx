"use client";

/**
 * The portal journey's frame (plan §6.3, §9.6): one centred column, the quiet five-step indicator
 * (Before we begin · How to share · Conversation · Review · Registered) and the demonstration
 * notice on every step (rule 11).
 */
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

export const STEPS = ["begin", "share", "conversation", "review", "registered"] as const;
export type StepKey = (typeof STEPS)[number];

export function PortalShell({ step, children }: { step: StepKey; children: React.ReactNode }) {
  const t = useTranslations("portal");
  const current = STEPS.indexOf(step);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 md:py-12" data-testid={`portal-${step}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs sm:text-sm" aria-label={t("stepsLabel")} data-testid="portal-steps">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-brand text-white" : active ? "border-2 border-brand text-brand" : "border border-line text-ink-3"}`}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={`${active ? "font-semibold text-ink" : done ? "text-ink-2" : "hidden text-ink-3 sm:inline"}`}>{t(`steps.${s}`)}</span>
              {i < STEPS.length - 1 && <span className="mx-0.5 h-px w-4 bg-line sm:w-6" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p role="note" className="rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-2 text-sm text-warn" data-testid="demo-notice">
        {t("notice")}
      </p>
      {children}
    </main>
  );
}

export function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="portal-error">
      {text}
    </p>
  );
}
