"use client";

/**
 * Reads text aloud with the browser's own speech engine (free, on the device,
 * nothing is sent anywhere). Interim audio for every prompt (NFR-ACC-02) until
 * recorded audio files are added.
 */
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toVictimLang } from "@/contracts/victim";
import { LANGUAGE_INFO } from "@/i18n/languages";

const noSubscribe = () => () => {};

export function ListenButton({ text, lang }: { text: string; lang: string }) {
  const t = useTranslations("common");
  const [speaking, setSpeaking] = useState(false);
  // false on the server, real value in the browser (no hydration mismatch)
  const supported = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);

  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  if (!supported) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGE_INFO[toVictimLang(lang)].speech;
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-1 text-base"
      aria-pressed={speaking}
    >
      <span aria-hidden>🔊</span> {speaking ? t("stop") : t("listen")}
    </button>
  );
}
