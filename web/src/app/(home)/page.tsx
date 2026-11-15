/**
 * Public victim-facing homepage (task F.2, FRONTEND_UX_PRODUCT_BRIEF.md §2.2, checklist §3).
 * A server component with no session and no case data. Every action leads to the real intake at
 * /portal/<lang> (create interaction → consent → safety check). Language comes from ?lang=.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/home/public-shell";
import { UrgentHelp } from "@/components/home/urgent-help";
import { WayCard } from "@/components/home/way-card";
import { parseLang, portalPath, publicPath, WAYS } from "@/lib/portal";

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const lang = parseLang((await searchParams).lang);
  const t = await getTranslations({ locale: lang, namespace: "app" });
  return { title: t("name") };
}

const PRIVACY_LINKS = ["what", "refuse", "who", "withdraw", "exit"] as const;
const HOW_STEPS = ["choose", "consent", "people"] as const;

export default async function Home({ searchParams }: PageProps<"/">) {
  const lang = parseLang((await searchParams).lang);
  const t = await getTranslations({ locale: lang });

  return (
    <PublicShell lang={lang} path="/">
      <section aria-labelledby="hero-title" className="flex max-w-[46rem] flex-col gap-4">
        <p className="font-semibold text-navy">{t("home.hero.eyebrow")}</p>
        <h1 id="hero-title" className="text-[1.625rem] font-bold leading-tight sm:text-[2.5rem]">
          {t("home.hero.title")}
        </h1>
        <p>{t("home.hero.lead")}</p>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-6">
          <Link href={portalPath(lang)} className="btn btn-primary btn-lg sm:w-auto sm:min-w-52" data-testid="home-start">
            {t("start.start")}
          </Link>
          <a href="#urgent" className="inline-flex min-h-11 items-center self-start font-semibold text-danger underline underline-offset-4 sm:self-center">
            {t("home.hero.urgent")}
          </a>
        </div>
        <p className="text-base text-ink-2">{t("home.hero.reassure")}</p>
      </section>

      <section aria-labelledby="ways-title" className="mt-12 flex flex-col gap-4">
        <h2 id="ways-title" className="text-[1.5rem] font-bold leading-snug">
          {t("home.ways.title")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {WAYS.map((w) => (
            <li key={w} className="flex">
              <WayCard lang={lang} way={w} title={t(`home.ways.${w}.title`)} body={t(`home.ways.${w}.body`)} />
            </li>
          ))}
        </ul>
        <p className="text-base text-ink-2">{t("home.ways.note")}</p>
      </section>

      <div className="mt-12">
        <UrgentHelp lang={lang} />
      </div>

      <section aria-labelledby="how-title" className="mt-12 flex flex-col gap-4">
        <h2 id="how-title" className="text-[1.5rem] font-bold leading-snug">
          {t("home.how.title")}
        </h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {HOW_STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-accent font-bold text-navy-deep">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-[1.125rem] font-semibold leading-snug">{t(`home.how.steps.${s}.title`)}</h3>
                <p className="text-base text-ink-2">{t(`home.how.steps.${s}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href={publicPath(lang, "/how-it-works")} className="link inline-flex min-h-11 items-center self-start">
          {t("home.nav.howItWorks")}
        </Link>
      </section>

      <section aria-labelledby="privacy-title" className="mt-12 flex flex-col gap-3 rounded-[6px] bg-accent p-5">
        <h2 id="privacy-title" className="text-[1.5rem] font-bold leading-snug">
          {t("home.privacy.title")}
        </h2>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {PRIVACY_LINKS.map((q) => (
            <li key={q}>
              <Link href={publicPath(lang, "/privacy", `#${q}`)} className="link inline-flex min-h-11 items-center">
                {t(`privacyPage.q.${q}`)}
              </Link>
            </li>
          ))}
        </ul>
        <Link href={publicPath(lang, "/privacy")} className="link inline-flex min-h-11 items-center self-start font-semibold">
          {t("home.privacy.more")}
        </Link>
      </section>
    </PublicShell>
  );
}
