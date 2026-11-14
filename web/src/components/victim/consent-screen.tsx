"use client";

/**
 * Consent notice with separate choices and audio (task 3.3/3.7, FR-CON-01/02).
 * Every choice starts unticked: nothing is analysed unless the person says yes.
 */
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { NOTICE_VERSION, api } from "./api";
import { ListenButton } from "./listen-button";

const OPTIONS = ["textAnalysis", "voiceAnalysis", "shareWithCounsellor", "followUpContact", "audioRetention"] as const;
const PARAGRAPHS = ["what", "why", "who", "howLong", "refuse", "withdraw"] as const;

export function ConsentScreen() {
  const t = useTranslations("consent");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const id = useSearchParams().get("i") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const choice = Object.fromEntries(OPTIONS.map((o) => [o, form.get(o) === "on"]));
    setBusy(true);
    setError(false);
    try {
      await api("POST", `/interactions/${id}/consent`, { noticeVersion: NOTICE_VERSION, language: locale, ...choice });
      router.replace(`/${locale}/chat?i=${id}`);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  const spoken = [t("title"), ...PARAGRAPHS.map((p) => t(p))].join(". ");
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <ListenButton text={spoken} lang={locale} />
      {PARAGRAPHS.map((p) => (
        <p key={p}>{t(p)}</p>
      ))}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">{t("choose")}</legend>
        {OPTIONS.map((o) => (
          <label key={o} className="flex min-h-12 items-center gap-3 rounded-md border border-border px-3 py-2">
            <input type="checkbox" name={o} aria-labelledby={`consent-${o}`} className="size-6 shrink-0" />
            <span id={`consent-${o}`}>{t(o)}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={busy || !id}
        className="min-h-14 rounded-lg bg-primary px-6 text-xl font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? tc("loading") : t("submit")}
      </button>
      {error && (
        <p role="alert" className="text-destructive">
          {tc("errorRetry")}
        </p>
      )}
    </form>
  );
}
