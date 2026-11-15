/**
 * Privacy (task F.2, brief §2.2 F). The same consent notice paragraphs (consent.*) the person reads
 * before starting, under plain questions, plus how Quick exit works. No new claims are made here.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/home/public-shell";
import { parseLang, portalPath, publicPath } from "@/lib/portal";

const NOTICE = ["what", "why", "who", "howLong", "refuse", "withdraw"] as const;

export async function generateMetadata({ searchParams }: PageProps<"/privacy">): Promise<Metadata> {
  const lang = parseLang((await searchParams).lang);
  const t = await getTranslations({ locale: lang });
  return { title: `${t("privacyPage.title")} · ${t("app.name")}` };
}

export default async function Privacy({ searchParams }: PageProps<"/privacy">) {
  const lang = parseLang((await searchParams).lang);
  const t = await getTranslations({ locale: lang });
  const heading = "text-[1.25rem] font-semibold leading-snug";
  return (
    <PublicShell lang={lang} path="/privacy">
      <article className="flex max-w-[46rem] flex-col gap-6">
        <h1 className="text-[2rem] font-bold leading-tight">{t("privacyPage.title")}</h1>
        <p>{t("privacyPage.intro")}</p>
        {NOTICE.map((k) => (
          <section key={k} id={k} aria-labelledby={`${k}-h`} className="flex scroll-mt-4 flex-col gap-1.5">
            <h2 id={`${k}-h`} className={heading}>
              {t(`privacyPage.q.${k}`)}
            </h2>
            <p>{t(`consent.${k}`)}</p>
          </section>
        ))}
        <section id="exit" aria-labelledby="exit-h" className="flex scroll-mt-4 flex-col gap-1.5">
          <h2 id="exit-h" className={heading}>
            {t("privacyPage.q.exit")}
          </h2>
          <p>{t("privacyPage.exitBody", { button: t("common.quickExit") })}</p>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <Link href={portalPath(lang)} className="btn btn-primary btn-lg sm:w-auto sm:min-w-52">
            {t("start.start")}
          </Link>
          <Link href={publicPath(lang)} className="link inline-flex min-h-11 items-center">
            {t("howItWorks.back")}
          </Link>
        </div>
      </article>
    </PublicShell>
  );
}
