"use client";

/**
 * Staff sign-in form (task 1.6, restyled in N.9): e-mail + password, then a 6-digit authenticator
 * code for TOTP roles. Split layout: a dark panel with the wordmark, the form on the right.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Wordmark } from "@/components/public/wordmark";

type Step = "password" | "totp";

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : ((await res.json().catch(() => ({}))) as Record<string, unknown>);
  return { ok: res.ok, data };
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/v1/staff/auth/login", { email: form.get("email"), password: form.get("password") });
    setBusy(false);
    if (!ok) return setError(String(data.detail ?? data.title ?? "Sign-in failed"));
    if (data.requiresTotp) return setStep("totp");
    router.replace("/staff");
  }

  async function onTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/v1/staff/auth/totp", { code: String(form.get("code") ?? "").trim() });
    setBusy(false);
    if (!ok) {
      if (data.code === "SESSION_EXPIRED") setStep("password");
      return setError(String(data.detail ?? data.title ?? "Sign-in failed"));
    }
    router.replace("/staff");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="panel-night relative flex flex-col justify-between overflow-hidden px-6 py-6 md:w-[42%] md:px-12 md:py-10">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-brand/40 blur-3xl" />
        <Link href="/" className="relative no-underline" aria-label="Nivara home">
          <Wordmark tone="light" size="lg" />
        </Link>
        <div className="relative mt-10 flex flex-col gap-4 md:mt-0">
          <p className="display text-3xl text-white md:text-4xl">Who needs you first.</p>
          <p className="max-w-sm text-white/70">Sign in to your role&apos;s portal: the queue in risk order, the evidence behind each case, the proposals waiting for a decision.</p>
        </div>
        <p className="relative mt-10 text-xs text-white/50 md:mt-0">For helpline staff only. Every sign-in is recorded.</p>
      </aside>

      <main className="flex flex-1 flex-col justify-center px-6 py-10 md:px-16">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-2 no-underline hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Back to home
          </Link>
          <div>
            <h1 className="page-title">Staff sign in</h1>
            <p className="page-lead">{step === "password" ? "Use the e-mail and password you were given." : "Enter the 6-digit code from your authenticator app."}</p>
          </div>

          {step === "password" ? (
            <form onSubmit={onPassword} className="flex flex-col gap-4">
              <label className="flex flex-col">
                <span className="label">E-mail</span>
                <input name="email" type="email" autoComplete="username" required autoFocus className="field min-h-11" />
              </label>
              <label className="flex flex-col">
                <span className="label">Password</span>
                <input name="password" type="password" autoComplete="current-password" required className="field min-h-11" />
              </label>
              <button type="submit" disabled={busy} className="btn btn-primary min-h-11 w-full">
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={onTotp} className="flex flex-col gap-4">
              <label className="flex flex-col">
                <span className="label">Authenticator code</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                  <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus className="field num min-h-11 pl-9 text-lg tracking-[0.3em]" />
                </div>
              </label>
              <button type="submit" disabled={busy} className="btn btn-primary min-h-11 w-full">
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button type="button" onClick={() => setStep("password")} className="btn btn-quiet btn-sm self-start">
                Use another account
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
