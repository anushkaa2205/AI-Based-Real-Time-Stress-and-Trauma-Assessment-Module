/**
 * Home page (Phase P, task P.6; NIVARA_FLOW_AND_UI_PLAN.md §6.2). A reference portal built on Nivara,
 * part of the demo input layer. The hero speaks to the person and has one main action, Start. Never a
 * score, band, indicator or staff screenshot (rule 1), and no invented numbers, testimonials or logos.
 * With the demo off, Start and the track field are hidden and the module is unaffected (FR-API-05).
 * All text comes from messages/*.json in the site language (P-D7).
 */
import Link from "next/link";
import { ArrowRight, Bot, Globe2, MessagesSquare, Phone, PhoneCall, Smartphone, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TrackForm } from "@/components/public/track-form";
import { demoEnabled } from "@/core/demo/client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: { absolute: (await getTranslations("public.home"))("metaTitle") } };
}

export default async function HomePage() {
  const demoOn = demoEnabled();
  const t = await getTranslations("public.home");
  const steps = [
    { n: "01", title: t("step1Title"), body: t("step1Body") },
    { n: "02", title: t("step2Title"), body: t("step2Body") },
    { n: "03", title: t("step3Title"), body: t("step3Body") },
  ];
  const roles = [
    { who: t("roleCounsellor"), what: t("roleCounsellorBody") },
    { who: t("roleOperator"), what: t("roleOperatorBody") },
    { who: t("roleDistrict"), what: t("roleDistrictBody") },
    { who: t("rolePolice"), what: t("rolePoliceBody") },
    { who: t("roleAnalytics"), what: t("roleAnalyticsBody") },
  ];
  const sources = [
    { icon: Globe2, label: t("sourcePortal"), here: true },
    { icon: PhoneCall, label: t("sourceHelpline") },
    { icon: Phone, label: t("sourceIvrs") },
    { icon: Bot, label: t("sourceChatbot") },
    { icon: Smartphone, label: t("sourceApp") },
  ];

  return (
    <>
      {/* Hero */}
      <section className="panel-night relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 -top-40 size-[34rem] rounded-full bg-brand/40 blur-3xl" />
          <div className="absolute -bottom-48 -left-24 size-[26rem] rounded-full bg-marigold/10 blur-3xl" />
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
          <p className="rise eyebrow text-marigold">{t("label")}</p>
          <h1 className="display rise rise-2 max-w-3xl text-4xl text-white md:text-[3.5rem] md:leading-[1.08]">{t("headline")}</h1>
          <p className="rise rise-3 max-w-xl text-lg leading-relaxed text-white/75">{t("lead")}</p>
          {demoOn ? (
            <div className="rise rise-3 flex flex-col gap-4" data-testid="hero-actions">
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/start" className="btn btn-accent btn-lg" data-testid="start">
                  {t("start")} <ArrowRight className="size-5" aria-hidden />
                </Link>
                <Link href="/track" className="text-sm font-medium text-white/80 underline-offset-4 hover:text-white" data-testid="hero-track">
                  {t("trackLink")}
                </Link>
              </div>
              <p className="text-sm text-white/65">
                <a href="tel:14566" className="text-white/80 underline-offset-4 hover:text-white">
                  {t("preferTalk")}
                </a>
              </p>
            </div>
          ) : (
            <p className="rise rise-3 max-w-xl rounded-xl border border-white/15 px-4 py-3 text-white/80" data-testid="demo-off">
              {t("demoOff")}
            </p>
          )}
        </div>
      </section>

      {/* How it works, for the person */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
        <p className="eyebrow">{t("howEyebrow")}</p>
        <h2 className="display mt-3 max-w-2xl text-3xl md:text-4xl">{t("howTitle")}</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col gap-3 border-t border-line pt-5">
              <span className="num text-sm text-brand">{s.n}</span>
              <h3 className="text-lg font-semibold leading-snug text-ink">{s.title}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Who sees what you share */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 md:grid-cols-[0.85fr_1.15fr] md:px-8 md:py-24">
          <div>
            <p className="eyebrow">{t("whoEyebrow")}</p>
            <h2 className="display mt-3 text-3xl md:text-4xl">{t("whoTitle")}</h2>
            <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-2">{t("whoLead")}</p>
          </div>
          <ul className="flex flex-col divide-y divide-line" data-testid="who-sees">
            {roles.map((r) => (
              <li key={r.who} className="flex gap-3 py-4 first:pt-0">
                <Users className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">
                  <span className="font-semibold text-ink">{r.who}</span> {r.what}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The engine behind this portal */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <p className="eyebrow">{t("engineEyebrow")}</p>
        <h2 className="display mt-3 max-w-2xl text-3xl md:text-4xl">{t("engineTitle")}</h2>
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-2">{t("engineLead")}</p>
        <div className="mt-10 grid items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]" aria-hidden data-testid="engine-diagram">
          <ul className="flex flex-col gap-2">
            {sources.map((s) => (
              <li key={s.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${s.here ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line bg-surface text-ink-2"}`}>
                <s.icon className="size-4 shrink-0" /> {s.label}
              </li>
            ))}
          </ul>
          <ArrowRight className="mx-auto size-5 rotate-90 text-ink-3 md:rotate-0" />
          <div className="rounded-xl bg-night px-5 py-6 text-center text-white">
            <p className="display text-2xl">{t("engineCore")}</p>
            <p className="mt-1 text-sm text-white/70">{t("engineCoreBody")}</p>
          </div>
          <ArrowRight className="mx-auto size-5 rotate-90 text-ink-3 md:rotate-0" />
          <div className="rounded-xl border border-line bg-surface px-5 py-6 text-center">
            <MessagesSquare className="mx-auto size-5 text-brand" />
            <p className="mt-2 font-semibold text-ink">{t("engineStaff")}</p>
            <p className="mt-1 text-sm text-ink-2">{t("engineStaffBody")}</p>
          </div>
        </div>
      </section>

      {/* Track a case */}
      {demoOn && (
        <section className="border-t border-line bg-surface-2">
          <div id="track" className="mx-auto grid w-full max-w-6xl scroll-mt-20 gap-8 px-5 py-16 md:grid-cols-2 md:items-end md:px-8 md:py-20">
            <div>
              <p className="eyebrow">{t("trackEyebrow")}</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{t("trackTitle")}</h2>
              <p className="hint mt-1">{t("trackLead")}</p>
            </div>
            <TrackForm />
          </div>
        </section>
      )}
    </>
  );
}
