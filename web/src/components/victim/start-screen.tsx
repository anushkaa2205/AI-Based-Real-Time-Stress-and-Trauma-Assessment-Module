"use client";

/** Welcome, AI disclosure (NFR-ETH-07) and start (task 3.7). */
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { ListenButton } from "./listen-button";
import { VictimChannel } from "@/contracts/victim";
import { parseWay, portalPath, withWay } from "@/lib/portal";

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
    // The homepage choice (F.2) is a hint only. Read at click time so this page stays static.
    const way = parseWay(new URLSearchParams(window.location.search).get("way"));
    try {
      // The browser portal is its own channel (audit G1); the keypad menu sends IVRS from ivrs-screen.
      const r = await api<{ interactionId: string }>("POST", "/interactions", { channel: VictimChannel.enum.PORTAL, language: locale });
      router.replace(withWay(portalPath(locale, `/consent?i=${r.interactionId}`), way));
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  const spoken = `${t("title")}. ${t("intro")} ${t("aiDisclosure")}`;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-[1.875rem] font-bold leading-tight text-ink">{t("title")}</h1>
        <p className="text-ink">{t("intro")}</p>
        <ListenButton text={spoken} lang={locale} />
      </div>
      <p className="border-l-4 border-navy bg-white px-4 py-3 text-[0.9375rem] text-ink-2">{t("aiDisclosure")}</p>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={start} disabled={busy} className="btn btn-primary btn-lg">
          {busy ? tc("loading") : t("start")}
        </button>
        <a href={portalPath(locale, "/ivrs")} className="btn btn-secondary btn-lg" data-testid="ivrs-link">
          {ti("title")}
        </a>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {tc("errorRetry")}
        </p>
      )}
    </section>
  );
}
