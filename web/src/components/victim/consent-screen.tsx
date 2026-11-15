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
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-[1.875rem] font-bold leading-tight">{t("title")}</h1>
        <ListenButton text={spoken} lang={locale} />
      </div>
      <div className="card card-pad flex flex-col gap-3 text-[1rem]">
        {PARAGRAPHS.map((p) => (
          <p key={p}>{t(p)}</p>
        ))}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">{t("choose")}</legend>
        {OPTIONS.map((o) => (
          <label
            key={o}
            className="flex min-h-13 cursor-pointer items-center gap-3 border border-line bg-white px-3.5 py-2.5 has-[:checked]:border-navy has-[:checked]:bg-accent"
            style={{ borderRadius: 4 }}
          >
            <input type="checkbox" name={o} aria-labelledby={`consent-${o}`} className="size-5 shrink-0 accent-[#1f3a5f]" />
            <span id={`consent-${o}`}>{t(o)}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={busy || !id} className="btn btn-primary btn-lg">
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
