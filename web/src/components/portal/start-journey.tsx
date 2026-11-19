"use client";

/**
 * Steps 1 and 2 on `/start` (Phase P, plan §6.3). Step 1, Before we begin: what happens to what they
 * share, the language (it is the site language, so changing it here changes the whole site), the
 * district and the consent; "I'd rather talk to someone" shows the numbers. Step 2, How to share:
 * Write or Speak, chosen once; choosing creates the interaction and opens the conversation.
 * Nothing is analysed before consent (rule 6).
 */
import { ArrowLeft, ArrowRight, Keyboard, Mic, Phone, PhoneCall, Siren } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { PortalMode } from "@/contracts/portal";
import type { VictimLang } from "@/contracts/interaction";
import { setSiteLanguage } from "@/components/ui/language-switcher";
import { SITE_LOCALES } from "@/i18n/locale";
import { ConsentFields, DistrictSelect, type DistrictOption } from "./consent-fields";
import { usePortal } from "./portal-provider";
import { ErrorLine, PortalShell } from "./portal-shell";

export function StartJourney({ districts, canTakeOver }: { districts: DistrictOption[]; canTakeOver: boolean }) {
  const p = usePortal();
  const t = useTranslations("portal");
  const h = useTranslations("public.header");
  const names = useTranslations("languageNames");
  const locale = useLocale();
  const router = useRouter();
  const [talk, setTalk] = useState(false);
  const [switching, startTransition] = useTransition();

  function changeLanguage(lang: VictimLang) {
    setSiteLanguage(lang);
    startTransition(() => router.refresh());
  }

  function cont(e: FormEvent) {
    e.preventDefault();
    p.setError(null);
    p.setReady(true);
  }

  async function choose(mode: PortalMode, takeover = false) {
    const ok = await p.start(mode, takeover);
    if (ok) router.push(mode === "LIVE_TEXT" ? "/start/write" : "/start/speak");
  }

  // A busy line shows its own message with the ways forward, not the generic error.
  const busyLine = p.error === "LINE_BUSY";

  if (!p.ready) {
    return (
      <PortalShell step="begin">
        <form onSubmit={cont} className="card card-pad flex flex-col gap-5" data-testid="begin">
          <div>
            <h1 className="page-title">{t("begin.title")}</h1>
            <ul className="mt-3 flex flex-col gap-1.5 text-ink-2">
              <li>{t("begin.p1")}</li>
              <li>{t("begin.p2")}</li>
              <li>{t("begin.p3")}</li>
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="portal-language" className="flex flex-col">
              <span className="label">{t("begin.language")}</span>
              <select id="portal-language" className="field min-h-11" value={locale} disabled={switching} onChange={(e) => changeLanguage(e.target.value as VictimLang)} data-testid="portal-language">
                {SITE_LOCALES.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {names(l)}
                  </option>
                ))}
              </select>
              <span className="hint mt-1">{t("begin.languageHint")}</span>
            </label>
            <DistrictSelect districts={districts} value={p.district} onChange={p.setDistrict} />
          </div>
          <ConsentFields value={p.consent} onChange={p.setConsent} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="submit" disabled={!p.district || switching} className="btn btn-primary btn-lg" data-testid="continue">
              {t("begin.continue")} <ArrowRight className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setTalk((v) => !v)} aria-expanded={talk} className="btn btn-quiet" data-testid="talk">
              <Phone className="size-4" aria-hidden /> {t("begin.talk")}
            </button>
          </div>
          {talk && (
            <section className="rounded-xl border border-line bg-surface-2 p-4" data-testid="talk-panel">
              <h2 className="font-semibold text-ink">{t("begin.talkTitle")}</h2>
              <p className="mt-1 text-sm text-ink-2">{t("begin.talkBody")}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <a href="tel:14566" className="btn btn-primary">
                  <PhoneCall className="size-4" aria-hidden /> {h("helpline")}
                </a>
                <a href="tel:112" className="btn btn-danger">
                  <Siren className="size-4" aria-hidden /> {h("emergency")}
                </a>
              </div>
            </section>
          )}
        </form>
      </PortalShell>
    );
  }

  const speakAllowed = p.consent.voiceAnalysis;
  return (
    <PortalShell step="share">
      <section className="flex flex-col gap-5" data-testid="share">
        <div>
          <h1 className="page-title">{t("share.title")}</h1>
          <p className="page-lead">{t("share.lead")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={p.busy} onClick={() => void choose("LIVE_TEXT")} className="card group flex flex-col items-start gap-3 p-5 text-left transition-all hover:-translate-y-px hover:border-brand hover:shadow-raise disabled:opacity-60" data-testid="choose-write">
            <span className="grid size-11 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden>
              <Keyboard className="size-5" />
            </span>
            <span className="text-lg font-semibold text-ink">{t("share.write")}</span>
            <span className="text-sm text-ink-2">{t("share.writeBody")}</span>
          </button>
          <button type="button" disabled={p.busy || !speakAllowed} onClick={() => void choose("LIVE_AUDIO")} className="card group flex flex-col items-start gap-3 p-5 text-left transition-all hover:-translate-y-px hover:border-brand hover:shadow-raise disabled:opacity-60" data-testid="choose-speak">
            <span className="grid size-11 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden>
              <Mic className="size-5" />
            </span>
            <span className="text-lg font-semibold text-ink">{t("share.speak")}</span>
            <span className="text-sm text-ink-2">{t("share.speakBody")}</span>
          </button>
        </div>
        {!speakAllowed && <p className="hint">{t("share.speakNeedsConsent")}</p>}
        {p.busy && <p className="text-sm text-ink-2">{t("share.starting")}</p>}
        {busyLine ? (
          <div className="flex flex-col gap-2" data-testid="line-busy">
            <ErrorLine text={t("share.busy")} />
            {canTakeOver && (
              <button type="button" onClick={() => void choose("LIVE_AUDIO", true)} className="btn btn-secondary self-start" data-testid="takeover">
                {t("share.takeover")}
              </button>
            )}
          </div>
        ) : (
          p.error && <ErrorLine text={t(`errors.${p.error}`)} />
        )}
        <button type="button" onClick={() => p.setReady(false)} className="btn btn-quiet self-start">
          <ArrowLeft className="size-4" aria-hidden /> {t("share.back")}
        </button>
      </section>
    </PortalShell>
  );
}
