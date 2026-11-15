import Link from "next/link";
import { MESSAGES } from "@/core/i18n/messages";
import { VICTIM_LANGS } from "@/contracts/victim";
import { LANGUAGE_INFO } from "@/i18n/languages";
import { portalPath } from "@/lib/portal";

/** Language choice (tasks 3.7, 8.1). Each button and heading is in its own language and script. */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-7 px-4 py-10">
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[3px] bg-navy text-[0.8rem] font-bold text-white">
          14566
        </span>
        <p className="text-sm font-semibold leading-snug text-ink-2">{MESSAGES.en.app.helpline}</p>
      </div>
      <h1 className="flex flex-col gap-0.5 text-[1.375rem] font-bold leading-snug">
        {VICTIM_LANGS.map((l) => (
          <span key={l} lang={l}>
            {MESSAGES[l].start.chooseLanguage}
          </span>
        ))}
      </h1>
      <ul className="flex flex-col gap-2.5">
        {VICTIM_LANGS.map((l) => (
          <li key={l}>
            <Link
              href={portalPath(l)}
              lang={l}
              className="btn btn-secondary btn-lg min-h-15 justify-between border-input px-5 text-[1.375rem] text-ink hover:border-navy"
            >
              <span>{LANGUAGE_INFO[l].label}</span>
              <span aria-hidden className="text-navy">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/login" className="link mt-6 self-center text-sm text-ink-2">
        Staff sign in
      </Link>
    </main>
  );
}
