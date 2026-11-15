/**
 * How it works (task F.2, brief §2.2 E). Describes the real steps of the intake flow in
 * core/conversation/flow.ts: language, consent, safety check, story, optional questions,
 * reference number. No scores, model names or risk bands (CLAUDE.md rule 1).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/home/public-shell";
import { parseLang, portalPath, publicPath } from "@/lib/portal";

const STEPS = ["language", "consent", "safety", "share", "more", "reference"] as const;

export async function generateMetadata({ searchParams }: PageProps<"/how-it-works">): Promise<Metadata> {
  const lang = parseLang((await searchParams).lang);
  const t = await getTranslations({ locale: lang });
  return { title: `${t("howItWorks.title")} · ${t("app.name")}` };
}

export default async function HowItWorks({ searchParams }: PageProps<"/how-it-works">) {
  const lang = parseLang((await searchParams).lang);
  const t = await getTranslations({ locale: lang });
  return (
    <PublicShell lang={lang} path="/how-it-works">
      <article className="flex max-w-[46rem] flex-col gap-6">
        <h1 className="text-[2rem] font-bold leading-tight">{t("howItWorks.title")}</h1>
        <p>{t("howItWorks.intro")}</p>
        <ol className="flex flex-col gap-5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-accent font-bold text-navy-deep">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-[1.25rem] font-semibold leading-snug">{t(`howItWorks.steps.${s}.title`)}</h2>
                <p className="text-ink-2">{t(`howItWorks.steps.${s}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
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
