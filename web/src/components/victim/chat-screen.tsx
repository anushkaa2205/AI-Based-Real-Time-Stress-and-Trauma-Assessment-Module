"use client";

/**
 * The conversation (tasks 3.4/3.7): one scripted question at a time, any of
 * them can be skipped. Shows the emergency panel when the server says so, and
 * nothing else about risk (CLAUDE.md rule 1).
 */
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { VICTIM_LANGS, type Prompt } from "@/contracts/victim";
import { LANGUAGE_INFO } from "@/i18n/languages";
import { api, VictimApiError, type Turn } from "./api";
import { ContextForm } from "./context-form";
import { EmergencyPanel } from "./emergency-panel";
import { ListenButton } from "./listen-button";
import { VoiceRecorder } from "./voice-recorder";
import { portalPath } from "@/lib/portal";

type View = { kind: "loading" } | { kind: "turn"; turn: Turn } | { kind: "done"; docket: string; closing: string } | { kind: "ended" };

const bigButton = "btn btn-lg";

export function ChatScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const id = useSearchParams().get("i") ?? "";
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [voiceNote, setVoiceNote] = useState<"micRefused" | "unavailable" | "needsConsent" | null>(null);
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
        router.replace(portalPath(locale, `/consent?i=${id}`));
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

  /** Spoken answer finished: its windows were analysed as they arrived; move to the next question. */
  const voiceDone = () =>
    step(async () => {
      const r = await api<{ reply: Prompt; showEmergencyPanel: boolean; emergency: Turn["emergency"] }>("POST", `/interactions/${id}/messages`, {
        voiceDone: true,
      });
      return { next: r.reply, showEmergencyPanel: r.showEmergencyPanel, emergency: r.emergency };
    });

  const showEmergency = (panel: NonNullable<Turn["emergency"]>) =>
    setView((v) => (v.kind === "turn" ? { kind: "turn", turn: { ...v.turn, showEmergencyPanel: true, emergency: panel } } : v));

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
      router.replace(portalPath(lang, `/chat?i=${id}`));
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
        <a href={portalPath(locale)} className={`${bigButton} btn-primary`}>
          {t("common.startAgain")}
        </a>
      </section>
    );
  }

  if (view.kind === "done") {
    return (
      <section className="flex flex-col gap-4" aria-live="polite">
        <h1 className="text-[1.875rem] font-bold leading-tight">{t("done.title")}</h1>
        <p>{view.closing}</p>
        <div className="card border-l-[6px] border-l-navy p-4">
          <p className="section-title">{t("done.docket")}</p>
          <p className="mt-1 font-mono text-[1.75rem] font-bold tracking-wider text-navy" data-testid="docket">
            {view.docket}
          </p>
          <p className="mt-2 text-base text-ink-2">{t("done.keep")}</p>
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
      <div className="flex flex-wrap justify-end gap-1.5 text-sm">
        {VICTIM_LANGS.filter((l) => l !== locale).map((l) => (
          <button key={l} type="button" onClick={() => switchLanguage(l)} lang={l} className="btn btn-secondary btn-sm min-h-11 px-3 font-medium">
            {LANGUAGE_INFO[l].label}
          </button>
        ))}
      </div>

      {turn.showEmergencyPanel && turn.emergency && <EmergencyPanel panel={turn.emergency} interactionId={id} />}

      <div aria-live="polite" className="flex flex-col gap-3">
        {p.intro && <p className="text-base text-ink-2">{p.intro}</p>}
        <h1 ref={headingRef} tabIndex={-1} className="text-[1.625rem] font-bold leading-snug outline-none" data-testid="prompt" data-key={p.key}>
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
              className={`${bigButton} btn-secondary justify-start border-navy text-left text-ink`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {p.input === "FREE_TEXT" && !voiceNote && (
        <VoiceRecorder interactionId={id} onEmergency={showEmergency} onFinished={voiceDone} onFallback={setVoiceNote} />
      )}
      {p.input === "FREE_TEXT" && voiceNote && (
        <p role="status" className="text-base" data-testid="voice-fallback">
          {t(`voice.${voiceNote}`)}
        </p>
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
            className="field p-3 text-lg leading-relaxed"
          />
          <button type="submit" disabled={busy} className={`${bigButton} btn-primary`}>
            {busy ? t("common.loading") : t("common.send")}
          </button>
        </form>
      )}

      {p.input === "CONTEXT_FORM" && <ContextForm onSubmit={sendContext} busy={busy} />}

      {p.input === "NONE" && p.key === "flow.close" && (
        <button type="button" disabled={busy} onClick={finish} className={`${bigButton} btn-primary`}>
          {t("common.finish")}
        </button>
      )}

      {p.skippable && p.input !== "CONTEXT_FORM" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => (p.input === "FREE_TEXT" ? skipText() : answer(p, null))}
          className="btn btn-quiet min-h-12 self-center text-base"
        >
          {t("common.skip")}
        </button>
      )}

      {error && (
        <p role="alert" className="border-l-4 border-danger bg-danger-soft px-3 py-2 text-danger">
          {t("common.errorRetry")}
        </p>
      )}

      <div className="mt-6 border-t border-line pt-4 text-base text-ink-2">
        {withdrawn ? (
          <p role="status">{t("consent.stopped")}</p>
        ) : (
          <button type="button" onClick={withdraw} disabled={busy} className="link min-h-11">
            {t("consent.stopAnalysis")}
          </button>
        )}
      </div>
    </section>
  );
}
