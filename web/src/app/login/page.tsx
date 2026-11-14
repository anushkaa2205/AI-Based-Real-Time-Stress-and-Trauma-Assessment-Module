"use client";

/** Staff sign-in: e-mail + password, then a 6-digit authenticator code for TOTP roles (task 1.6). */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

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

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Staff sign in</h1>

      {step === "password" ? (
        <form onSubmit={onPassword} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            E-mail
            <input name="email" type="email" autoComplete="username" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Password
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </label>
          <Button type="submit" disabled={busy} size="lg">
            {busy ? "Checking…" : "Continue"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onTotp} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
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
          <Button type="submit" disabled={busy} size="lg">
            {busy ? "Checking…" : "Sign in"}
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </main>
  );
}
