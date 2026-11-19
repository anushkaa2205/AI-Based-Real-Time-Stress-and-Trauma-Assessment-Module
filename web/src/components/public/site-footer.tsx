import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "./wordmark";

/**
 * Public footer (Phase P, plan §6.2 item 6): the wordmark, the problem statement credit
 * and a link for integrators to the API documentation. The helpline numbers live in the header.
 * Text from messages/*.json in the site language.
 */
export async function SiteFooter() {
  const t = await getTranslations("public.footer");
  const nav = await getTranslations("public.nav");
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1.4fr_1fr] md:px-8">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-md text-sm text-ink-2">{t("credit")}</p>
        </div>
        <div className="flex flex-col gap-2 text-sm md:items-end">
          <Link href="/api/docs" className="link">
            {t("integrators")}
          </Link>
          <Link href="/login" className="link">
            {nav("staffLogin")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
