"use client";

/** Welcome, AI disclosure (NFR-ETH-07) and start (task 3.7). */
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { ListenButton } from "./listen-button";

export function StartScreen() {
  const t = useTranslations("start");
  const tc = useTranslations("common");
  const ti = useTranslations("ivrs");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setBusy(true);
    setError(false);
    try {
      const r = await api<{ interactionId: string }>("POST", "/interactions", { channel: "CHATBOT", language: locale });
      router.replace(`/${locale}/consent?i=${r.interactionId}`);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  const spoken = `${t("title")}. ${t("intro")} ${t("aiDisclosure")}`;
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <p className="rounded-md bg-muted p-3 text-base">{t("aiDisclosure")}</p>
      <ListenButton text={spoken} lang={locale} />
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="min-h-14 rounded-lg bg-primary px-6 text-xl font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? tc("loading") : t("start")}
      </button>
      <a href={`/${locale}/ivrs`} className="min-h-12 rounded-lg border border-border px-4 py-3 text-center text-lg" data-testid="ivrs-link">
        {ti("title")}
      </a>
      {error && (
        <p role="alert" className="text-destructive">
          {tc("errorRetry")}
        </p>
      )}
    </section>
  );
}
