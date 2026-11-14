"use client";

/**
 * The conversation (tasks 3.4/3.7): one scripted question at a time, any of
 * them can be skipped. Shows the emergency panel when the server says so, and
 * nothing else about risk (CLAUDE.md rule 1).
 */
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Prompt } from "@/contracts/victim";
import { api, VictimApiError, type Turn } from "./api";
import { ContextForm } from "./context-form";
import { EmergencyPanel } from "./emergency-panel";
import { ListenButton } from "./listen-button";

type View = { kind: "loading" } | { kind: "turn"; turn: Turn } | { kind: "done"; docket: string; closing: string } | { kind: "ended" };

const bigButton = "min-h-14 rounded-lg px-4 text-xl font-semibold disabled:opacity-60";

export function ChatScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const id = useSearchParams().get("i") ?? "";
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const fail = useCallback((e: unknown) => {
    if (e instanceof VictimApiError && (e.code === "SESSION_EXPIRED" || e.code === "INTERACTION_ENDED")) {
      setView({ kind: "ended" });
    } else {
      setError(true);
    }
  }, []);

  const show = useCallback(
    (turn: Turn) => {
      if (turn.next.key === "consent.title") {
        router.replace(`/${locale}/consent?i=${id}`);
        return;
      }
      setView({ kind: "turn", turn });
      setError(false);
      requestAnimationFrame(() => headingRef.current?.focus());
    },
    [id, locale, router],
  );

  useEffect(() => {
    if (!id) return;
    api<{ prompt: Prompt; showEmergencyPanel: boolean; emergency: Turn["emergency"] }>("GET", `/interactions/${id}/next`)
      .then((r) => show({ next: r.prompt, showEmergencyPanel: r.showEmergencyPanel, emergency: r.emergency }))
      .catch(fail);
  }, [id, show, fail]);

  async function step(fn: () => Promise<Turn>) {
    setBusy(true);
    try {
      show(await fn());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const answer = (p: Prompt, value: number | null) =>
    step(() =>
      api<Turn>("POST", `/interactions/${id}/screeners`, {
        instrument: p.screener!.instrument,
        itemCode: p.screener!.itemCode,
        value,
        skipped: value === null,
      }),
    );

  const sendText = (e: FormEvent<HTMLFormElement>, p: Prompt) => {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("text") ?? "").trim();
    if (!text) return;
    void step(async () => {
      const r = await api<{ reply: Prompt; showEmergencyPanel: boolean; emergency: Turn["emergency"] }>(
        "POST",
        `/interactions/${id}/messages`,
        { text, promptKey: p.key },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      form.reset();
      return { next: r.reply, showEmergencyPanel: r.showEmergencyPanel, emergency: r.emergency };
    });
  };

  const skipText = () =>
    step(async () => {
      const r = await api<{ reply: Prompt; showEmergencyPanel: boolean; emergency: Turn["emergency"] }>(
        "POST",
        `/interactions/${id}/messages`,
        { skipped: true },
      );
      return { next: r.reply, showEmergencyPanel: r.showEmergencyPanel, emergency: r.emergency };
    });

  const sendContext = (ctx: Record<string, unknown>) => step(() => api<Turn>("PUT", `/interactions/${id}/context`, ctx));

  async function finish() {
    setBusy(true);
    try {
      const r = await api<{ docketNumber: string; closingMessage: string }>("POST", `/interactions/${id}/end`, { reason: "COMPLETED" });
      setView({ kind: "done", docket: r.docketNumber, closing: r.closingMessage });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function switchLanguage(lang: string) {
    try {
      await api("POST", `/interactions/${id}/language`, { language: lang });
      router.replace(`/${lang}/chat?i=${id}`);
    } catch (e) {
      fail(e);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      await api("POST", `/interactions/${id}/consent/withdraw`, { reason: null });
      setWithdrawn(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === "loading" && id) return <p aria-live="polite">{t("common.loading")}</p>;

  if (view.kind === "ended" || view.kind === "loading") {
    return (
      <section className="flex flex-col gap-4">
        <p>{t("common.sessionEnded")}</p>
        <a href={`/${locale}`} className={`${bigButton} flex items-center justify-center bg-primary text-primary-foreground`}>
          {t("common.startAgain")}
        </a>
      </section>
    );
  }

  if (view.kind === "done") {
    return (
      <section className="flex flex-col gap-4" aria-live="polite">
        <h1 className="text-3xl font-semibold">{t("done.title")}</h1>
        <p>{view.closing}</p>
        <div className="rounded-lg border-2 border-primary p-4">
          <p className="text-base">{t("done.docket")}</p>
          <p className="font-mono text-2xl font-bold tracking-wide" data-testid="docket">
            {view.docket}
          </p>
          <p className="mt-2 text-base">{t("done.keep")}</p>
        </div>
        <p className="text-base">{t("done.track")}</p>
      </section>
    );
  }

  const { turn } = view;
  const p = turn.next;
  const spoken = [p.intro, p.text].filter(Boolean).join(" ");

  return (
    <section className="flex flex-col gap-5">
      <div className="flex justify-end gap-2 text-base">
        {(["en", "hi"] as const)
          .filter((l) => l !== locale)
          .map((l) => (
            <button key={l} type="button" onClick={() => switchLanguage(l)} className="min-h-11 rounded-md border border-border px-3">
              {l === "hi" ? "हिंदी" : "English"}
            </button>
          ))}
      </div>

      {turn.showEmergencyPanel && turn.emergency && <EmergencyPanel panel={turn.emergency} interactionId={id} />}

      <div aria-live="polite" className="flex flex-col gap-3">
        {p.intro && <p className="text-base text-muted-foreground">{p.intro}</p>}
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none" data-testid="prompt" data-key={p.key}>
          {p.text}
        </h1>
        <ListenButton text={spoken} lang={locale} />
      </div>

      {(p.input === "YES_NO" || p.input === "SCALE_0_3") && (
        <div className="flex flex-col gap-3">
          {(p.choices ?? []).map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={busy}
              onClick={() => answer(p, Number(c.value))}
              className={`${bigButton} border-2 border-primary bg-background text-foreground`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {p.input === "FREE_TEXT" && (
        <form onSubmit={(e) => sendText(e, p)} className="flex flex-col gap-3">
          <label className="sr-only" htmlFor="text">
            {t("common.typeHere")}
          </label>
          <textarea
            id="text"
            name="text"
            rows={5}
            maxLength={2000}
            placeholder={t("common.typeHere")}
            className="w-full rounded-md border border-input bg-background p-3 text-lg"
          />
          <button type="submit" disabled={busy} className={`${bigButton} bg-primary text-primary-foreground`}>
            {busy ? t("common.loading") : t("common.send")}
          </button>
        </form>
      )}

      {p.input === "CONTEXT_FORM" && <ContextForm onSubmit={sendContext} busy={busy} />}

      {p.input === "NONE" && p.key === "flow.close" && (
        <button type="button" disabled={busy} onClick={finish} className={`${bigButton} bg-primary text-primary-foreground`}>
          {t("common.finish")}
        </button>
      )}

      {p.skippable && p.input !== "CONTEXT_FORM" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => (p.input === "FREE_TEXT" ? skipText() : answer(p, null))}
          className="min-h-12 rounded-lg border border-border text-lg"
        >
          {t("common.skip")}
        </button>
      )}

      {error && (
        <p role="alert" className="text-destructive">
          {t("common.errorRetry")}
        </p>
      )}

      <div className="mt-6 border-t border-border pt-4 text-base">
        {withdrawn ? (
          <p role="status">{t("consent.stopped")}</p>
        ) : (
          <button type="button" onClick={withdraw} disabled={busy} className="underline underline-offset-4">
            {t("consent.stopAnalysis")}
          </button>
        )}
      </div>
    </section>
  );
}
