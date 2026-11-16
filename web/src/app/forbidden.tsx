import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <p className="eyebrow">403</p>
      <h1 className="page-title">Not allowed</h1>
      <p className="text-ink-2">Your role does not have access to this page.</p>
      <div>
        <Link href="/staff" className="btn btn-primary">
          Go to my portal
        </Link>
      </div>
    </main>
  );
}
