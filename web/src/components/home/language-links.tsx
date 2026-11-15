/**
 * Language selector for the public pages (task F.2, brief §2.2 A). Plain links, each in its own
 * language and script; the current one is marked with aria-current. No cookie, no script.
 */
import Link from "next/link";
import { VICTIM_LANGS, type VictimLang } from "@/contracts/victim";
import { LANGUAGE_INFO } from "@/i18n/languages";
import { publicPath } from "@/lib/portal";

export function LanguageLinks({ lang, path, label }: { lang: VictimLang; path: string; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {VICTIM_LANGS.map((l) => {
          const current = l === lang;
          return (
            <li key={l}>
              <Link
                href={publicPath(l, path)}
                lang={l}
                hrefLang={l}
                aria-current={current ? "true" : undefined}
                className={
                  current
                    ? "inline-flex min-h-11 items-center rounded-[6px] bg-accent px-2.5 font-semibold text-navy-deep no-underline"
                    : "inline-flex min-h-11 items-center rounded-[6px] px-2.5 text-ink underline decoration-input underline-offset-4 hover:bg-muted"
                }
              >
                {LANGUAGE_INFO[l].label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
