"use client";

/**
 * Step 3, Conversation (Phase P, plan §6.3). The assistant's lines are scripted questions the module
 * chose and the server recorded (P-D4), labelled as the assistant, never as a person or as AI. The
 * person answers in their own words: no quick replies or Yes/No buttons. Skip this question asks for
 * the next one; Finish goes to Review. The emergency options open at once and stay open.
 */
import { MessageCircleQuestion, Send, SkipForward, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_LIVE_CALL_MS } from "@/core/portal/limits";
import { LiveRecorder, type RecorderLabels } from "@/components/audio/live-recorder";
import type { PortalAudioReceipt } from "@/contracts/portal";
import { EmergencyPanel } from "./emergency-panel";
import { usePortal, type Turn } from "./portal-provider";
import { ErrorLine } from "./portal-shell";

export function TurnList({ turns, heardLabel }: { turns: Turn[]; heardLabel?: boolean }) {
  const t = useTranslations("portal");
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns]);
  return (
    <ol ref={listRef} className="flex max-h-[28rem] min-h-[12rem] flex-col gap-3 overflow-y-auto bg-surface-2/60 p-4" data-testid="chat" aria-live="polite">
      {turns.map((x) =>
        x.who === "assistant" ? (
          <li key={x.key} className="flex items-start gap-2.5" data-testid={x.closing ? "line-closing" : "line-assistant"}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-brand ring-1 ring-line" aria-hidden>
              <MessageCircleQuestion className="size-3.5" />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface px-3.5 py-2 ring-1 ring-line">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-3">{t("conv.assistant")}</p>
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">{x.closing ? t("closing") : x.text}</p>
            </div>
          </li>
        ) : (
          <li key={x.key} className="flex flex-row-reverse items-start gap-2.5" data-testid="line-person">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden>
              <User className="size-3.5" />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand px-3.5 py-2 text-white">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-white/70">{heardLabel ? t("speak.heard") : t("conv.you")}</p>
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{x.text || (heardLabel ? t("speak.heardNothing") : "")}</p>
              {x.state !== "sent" && <p className="mt-0.5 text-[0.6875rem] text-white/75">{x.state === "sending" ? t("conv.sending") : t("conv.notSent")}</p>}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function canSkip(turns: Turn[], closed: boolean): boolean {
  const last = turns[turns.length - 1];
  return !closed && !!last && last.who === "assistant" && !last.closing;
}

export function WriteConversation() {
  const p = usePortal();
  const t = useTranslations("portal");
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft;
    if (!text.trim() || p.busy) return;
    setDraft("");
    void p.sendText(text);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {p.emergency && <EmergencyPanel panel={p.emergency} />}
      <section className="card flex flex-col overflow-hidden" aria-label={t("steps.conversation")}>
        <TurnList turns={p.turns} />
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            maxLength={2000}
            placeholder={t("conv.placeholder")}
            className="field resize-none"
            aria-label={t("conv.inputLabel")}
            data-testid="draft"
          />
          <button type="submit" disabled={!draft.trim() || p.busy} className="btn btn-primary min-h-11" aria-label={t("conv.send")} data-testid="send">
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </section>
      <Footer />
    </div>
  );
}

function Footer() {
  const p = usePortal();
  const t = useTranslations("portal");
  const answered = p.turns.some((x) => x.who === "person");
  return (
    <>
      {p.error && <ErrorLine text={t(`errors.${p.error}`)} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <button type="button" disabled={p.busy || !canSkip(p.turns, p.closed)} onClick={() => void p.skip()} className="btn btn-secondary" data-testid="skip">
          <SkipForward className="size-4" aria-hidden /> {t("conv.skip")}
        </button>
        <button type="button" disabled={p.busy || !answered} onClick={p.toReview} className="btn btn-primary" data-testid="finish">
          {t("conv.finish")}
        </button>
      </div>
      <p className="hint">{t("conv.languageNote")}</p>
    </>
  );
}

export function SpeakConversation() {
  const p = usePortal();
  const t = useTranslations("portal");
  const [problem, setProblem] = useState<string | null>(null);
  const labels: RecorderLabels = {
    speak: t("speak.start"),
    recording: t("speak.recording"),
    muted: t("speak.muted"),
    sending: t("speak.sending"),
    mute: t("speak.mute"),
    unmute: t("speak.unmute"),
    stop: t("speak.done"),
  };
  const id = p.interactionId;
  return (
    <div className="flex flex-col gap-4">
      {p.emergency && <EmergencyPanel panel={p.emergency} />}
      <section className="card flex flex-col overflow-hidden" aria-label={t("steps.conversation")}>
        <TurnList turns={p.turns} heardLabel />
        <div className="flex flex-col items-center gap-3 border-t border-line p-4">
          <p className="hint text-center">{t("speak.questionNote")}</p>
          {id && (
            <LiveRecorder
              interactionId={id}
              labels={labels}
              maxTotalMs={MAX_LIVE_CALL_MS}
              send={(form) => fetch(`/api/portal/interactions/${id}/audio`, { method: "POST", body: form, credentials: "same-origin" }).catch(() => null)}
              onReply={(r) => p.audioReply(r as PortalAudioReceipt)}
              onEmergency={() => undefined}
              onFinished={async () => {
                setProblem(null);
                await p.finishAnswer();
              }}
              onFallback={(reason) =>
                setProblem(reason === "micRefused" ? t("speak.micRefused") : reason === "needsConsent" ? t("speak.needsConsent") : reason === "ended" ? t("errors.INTERACTION_ENDED") : t("speak.unavailable"))
              }
            />
          )}
          {problem && <ErrorLine text={problem} />}
        </div>
      </section>
      <Footer />
    </div>
  );
}
