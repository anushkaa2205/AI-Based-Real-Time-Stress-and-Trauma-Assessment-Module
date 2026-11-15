"use client";

/**
 * Quick exit on every victim screen (FR-CH-09, AC-CH-05): blanks the page,
 * ends the session in the background and replaces the page with a neutral
 * site, so the Back button does not return here.
 */
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const NEUTRAL_URL = "https://www.google.com";

function QuickExitButton() {
  const t = useTranslations("common");
  const params = useSearchParams();
  const id = params.get("i");

  function exit() {
    document.body.style.visibility = "hidden";
    if (id && /^[a-f0-9]{24}$/.test(id)) {
      const body = new Blob([JSON.stringify({ reason: "QUICK_EXIT" })], { type: "application/json" });
      navigator.sendBeacon?.(`/api/v1/victim/interactions/${id}/end`, body);
    }
    window.location.replace(NEUTRAL_URL);
  }

  return (
    <button
      type="button"
      onClick={exit}
      className="btn btn-danger min-h-11 shrink-0 whitespace-nowrap px-3.5"
      aria-label={`${t("quickExit")}: ${t("quickExitHint")}`}
    >
      <span aria-hidden>✕</span> {t("quickExit")}
    </button>
  );
}

export function QuickExit() {
  return (
    <Suspense fallback={null}>
      <QuickExitButton />
    </Suspense>
  );
}
