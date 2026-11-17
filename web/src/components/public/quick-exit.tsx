"use client";

/**
 * Quick exit (Phase P, P-D6, FR-DEMO-06; plan §6.1). Always visible. Replaces this page with a neutral
 * public site through `location.replace`, so Back does not return to Nivara, and drops anything this
 * tab kept (the conversation lives in memory and goes with the page).
 */
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

/** Where Quick exit goes (plan §14: a neutral public site). */
export const QUICK_EXIT_URL = "https://www.google.com";

export function quickExit(target = QUICK_EXIT_URL): void {
  try {
    sessionStorage.clear();
  } catch {
    /* storage may be blocked; leaving is what matters */
  }
  window.location.replace(target);
}

export function QuickExit({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const t = useTranslations("public.header");
  return (
    <button
      type="button"
      onClick={() => quickExit()}
      title={t("quickExitHint")}
      className={`btn btn-sm gap-1.5 whitespace-nowrap ${tone === "light" ? "bg-white text-night hover:bg-white/90" : "bg-ink text-white hover:bg-ink/90"}`}
      data-testid="quick-exit"
    >
      <LogOut className="size-4" aria-hidden /> {t("quickExit")}
    </button>
  );
}
