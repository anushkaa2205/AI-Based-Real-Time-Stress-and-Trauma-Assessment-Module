import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "./wordmark";

/** Public footer (plan §6.2 item 6). Text from messages/*.json in the site language (P.5). */
export async function SiteFooter() {
  const t = await getTranslations("public.footer");
  const nav = await getTranslations("public.nav");
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-sm text-sm text-ink-2">{t("about")}</p>
        </div>
        <div className="text-sm">
          <p className="section-title mb-2">{t("demoTitle")}</p>
          <p className="text-ink-2">{t("demoBody")}</p>
        </div>
        <div className="text-sm">
          <p className="section-title mb-2">{t("helpTitle")}</p>
          <p className="text-ink-2">{t("helpBody")}</p>
          <p className="mt-3">
            <Link href="/login" className="link">
              {nav("staffLogin")}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
