import Link from "next/link";

/**
 * Neutral start page. The victim flow (language choice, consent, chat) is
 * built in Phase 3; victim-facing wording will then come from messages/*.json.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">NHAA Assist</h1>
      <p className="text-muted-foreground">
        Project placeholder. The support flow for callers is being built.
      </p>
      <Link href="/login" className="text-primary underline underline-offset-4">
        Staff sign in
      </Link>
    </main>
  );
}
