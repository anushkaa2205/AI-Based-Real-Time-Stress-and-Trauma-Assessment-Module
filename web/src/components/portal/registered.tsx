"use client";

/** Step 5, Registered (plan §6.3): the docket ID is the largest thing on the page. */
import Link from "next/link";
import { Check, Copy, Home, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function Registered({ docketNumber, onHome }: { docketNumber: string; onHome: () => void }) {
  const t = useTranslations("portal.registered");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(docketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the number is on screen */
    }
  }
  return (
    <section className="card card-raise flex flex-col items-center gap-5 p-7 text-center md:p-10" data-testid="registered">
      <span className="grid size-12 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden>
        <Check className="size-6" />
      </span>
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t("title")}</h2>
        <p className="mt-1 text-ink-2">{t("lead")}</p>
      </div>
      <p className="num select-all rounded-xl bg-surface-2 px-5 py-4 text-2xl font-medium tracking-wider text-ink sm:text-4xl" data-testid="docket">
        {docketNumber}
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button type="button" onClick={copy} className="btn btn-secondary" data-testid="copy-docket">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? t("copied") : t("copy")}
        </button>
        <Link href={`/track/${docketNumber}`} className="btn btn-primary" data-testid="track-this">
          <Search className="size-4" aria-hidden /> {t("track")}
        </Link>
        <Link href="/" onClick={onHome} className="btn btn-quiet" data-testid="back-home">
          <Home className="size-4" aria-hidden /> {t("home")}
        </Link>
      </div>
    </section>
  );
}
