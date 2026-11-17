"use client";

/**
 * Step 4, Review (Phase P, P-D5, plan §6.3). The person's own words in order, each assistant question
 * in muted text above its answer; for Speak, "What we heard". No AI summary and no interpretation
 * (rules 1 and 2). One note can be added: earlier turns cannot be edited, because the module analysed
 * them as they arrived, so the note is how a correction reaches staff. Submit ends the interaction.
 */
import { ArrowLeft, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePortal } from "./portal-provider";
import { ErrorLine } from "./portal-shell";

export function Review() {
  const p = usePortal();
  const t = useTranslations("portal");
  const [note, setNote] = useState("");
  const speak = p.mode === "LIVE_AUDIO";
  const answers = p.turns.filter((x) => x.who === "person");

  // Pair each answer with the question just before it.
  const rows: { question: string | null; answer: string; key: string }[] = [];
  let lastQ: string | null = null;
  for (const x of p.turns) {
    if (x.who === "assistant") lastQ = x.closing ? null : x.text;
    else {
      rows.push({ question: lastQ, answer: x.text, key: x.key });
      lastQ = null;
    }
  }

  return (
    <section className="flex flex-col gap-5" data-testid="review">
      <div>
        <h1 className="page-title">{t("review.title")}</h1>
        <p className="page-lead">{t("review.lead")}</p>
      </div>
      <div className="card card-pad flex flex-col gap-4">
        {speak && <p className="section-title">{t("review.whatWeHeard")}</p>}
        {answers.length === 0 ? (
          <p className="text-ink-2">{t("review.nothing")}</p>
        ) : (
          <ol className="flex flex-col gap-4" data-testid="review-list">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 last:pb-0">
                {r.question && <p className="text-sm text-ink-3">{r.question}</p>}
                <p className="whitespace-pre-wrap text-ink">{r.answer || (speak ? t("speak.heardNothing") : "")}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <label className="flex flex-col">
        <span className="label">{t("review.noteLabel")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="field" data-testid="note" />
        <span className="hint mt-1">{t("review.noteHint")}</span>
      </label>
      {p.error && <ErrorLine text={t(`errors.${p.error}`)} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" onClick={p.toConversation} disabled={p.busy} className="btn btn-quiet" data-testid="back-to-conversation">
          <ArrowLeft className="size-4" aria-hidden /> {t("review.back")}
        </button>
        <button type="button" onClick={() => void p.submit(note)} disabled={p.busy || (answers.length === 0 && !note.trim())} className="btn btn-primary btn-lg" data-testid="submit">
          <Send className="size-4" aria-hidden /> {p.busy ? t("review.submitting") : t("review.submit")}
        </button>
      </div>
    </section>
  );
}
