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
      className="min-h-12 rounded-md bg-red-700 px-4 py-2 text-base font-semibold text-white shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-900"
      aria-label={`${t("quickExit")}: ${t("quickExitHint")}`}
    >
      {t("quickExit")} ✕
    </button>
  );
}

export function QuickExit() {
  return (
    <div className="sticky top-0 z-50 flex justify-end bg-background/95 px-4 py-2 backdrop-blur">
      <Suspense fallback={null}>
        <QuickExitButton />
      </Suspense>
    </div>
  );
}
