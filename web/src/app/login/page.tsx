"use client";

/** Staff sign-in: e-mail + password, then a 6-digit authenticator code for TOTP roles (task 1.6). */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

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

const inputClass = "field min-h-10 text-base";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/v1/staff/auth/login", {
      email: form.get("email"),
      password: form.get("password"),
    });
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 py-10">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[3px] bg-navy text-[0.72rem] font-bold text-white">
          14566
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-ink-2">NHAA Assist</p>
          <h1 className="text-xl font-bold">Staff sign in</h1>
        </div>
      </div>
      <div className="card card-pad">

      {step === "password" ? (
        <form onSubmit={onPassword} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
            E-mail
            <input name="email" type="email" autoComplete="username" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
            Password
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </label>
          <button type="submit" disabled={busy} className="btn btn-primary min-h-10 w-full">
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={onTotp} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
            6-digit code from your authenticator app
            <input
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={busy} className="btn btn-primary min-h-10 w-full">
            {busy ? "Checking…" : "Sign in"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 border-l-4 border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      </div>
      <p className="text-xs text-ink-2">For helpline staff only. Every sign-in is recorded.</p>
    </main>
  );
}
