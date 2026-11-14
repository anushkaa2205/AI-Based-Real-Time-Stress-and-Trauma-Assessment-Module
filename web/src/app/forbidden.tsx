import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">403: Not allowed</h1>
      <p className="text-muted-foreground">Your role does not have access to this page.</p>
      <Link href="/staff" className="text-primary underline underline-offset-4">
        Go to your home page
      </Link>
    </main>
  );
}
