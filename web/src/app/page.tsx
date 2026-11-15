import Link from "next/link";
import { MESSAGES } from "@/core/i18n/messages";
import { VICTIM_LANGS } from "@/contracts/victim";
import { LANGUAGE_INFO } from "@/i18n/languages";

/** Language choice (tasks 3.7, 8.1). Each button and heading is in its own language and script. */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="flex flex-col gap-1 text-2xl font-semibold">
        {VICTIM_LANGS.map((l) => (
          <span key={l} lang={l}>
            {MESSAGES[l].start.chooseLanguage}
          </span>
        ))}
      </h1>
      <ul className="flex flex-col gap-3">
        {VICTIM_LANGS.map((l) => (
          <li key={l}>
            <Link
              href={`/${l}`}
              lang={l}
              className="flex min-h-16 items-center justify-center rounded-lg border-2 border-primary text-2xl font-semibold"
            >
              {LANGUAGE_INFO[l].label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-center text-muted-foreground">{MESSAGES.en.app.helpline}</p>
      <Link href="/login" className="mt-8 text-center text-sm text-muted-foreground underline underline-offset-4">
        Staff sign in
      </Link>
    </main>
  );
}
