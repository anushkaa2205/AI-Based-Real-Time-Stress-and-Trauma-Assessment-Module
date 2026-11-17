"use client";

/**
 * Demo input 2, speak (tasks M.12, N.7; NIVARA_FLOW_AND_UI_PLAN.md §6.3). The visitor talks into the
 * microphone as a caller would; the recorder sends 5-second windows through /api/demo to the module
 * with the demo key, as the caller's own channel. One live call at a time; a call lasts at most three
 * minutes; audio is never stored. The page shows only that it is listening (rule 1).
 */
import { Keyboard } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LiveRecorder } from "@/components/audio/live-recorder";
import type { VictimLang } from "@/contracts/interaction";
import { MAX_LIVE_CALL_MS } from "@/core/demo/limits";
import { ConsentFields, DEFAULT_DISTRICT, DistrictSelect, FULL_CONSENT, LanguageSelect, type DemoConsent, type DistrictOption } from "./consent-fields";
import { DemoShell } from "./demo-shell";
import { EmergencyPanel } from "./emergency-panel";
import { ErrorLine } from "./live-text-demo";
import { Registered } from "./registered";
import { useDemoCase } from "./use-demo-case";

const TITLE = "Speak";
const LEAD = "Talk into your microphone as a caller would. Five-second windows go to the module while you speak; nothing is stored, and you get a docket ID at the end.";

export function LiveCallDemo({ districts, canTakeOver }: { districts: DistrictOption[]; canTakeOver: boolean }) {
  const demo = useDemoCase();
  const [language, setLanguage] = useState<VictimLang>("en");
  const [district, setDistrict] = useState(districts.some((d) => d.code === DEFAULT_DISTRICT) ? DEFAULT_DISTRICT : (districts[0]?.code ?? ""));
  const [consent, setConsent] = useState<DemoConsent>({ ...FULL_CONSENT, voiceAnalysis: true });
  const [fallback, setFallback] = useState<string | null>(null);

  async function start(e: FormEvent, takeover = false) {
    e.preventDefault();
    setFallback(null);
    await demo.start({ mode: "LIVE_AUDIO", language, districtCode: district, consent, takeover });
  }

  const busy = demo.phase === "consent" && demo.errorCode === "LINE_BUSY";

  function another() {
    demo.reset();
    setFallback(null);
  }

  const shell = (children: React.ReactNode) => (
    <DemoShell title={TITLE} lead={LEAD} phase={demo.phase}>
      {children}
    </DemoShell>
  );

  if (demo.phase === "registered" && demo.docketNumber) return shell(<Registered docketNumber={demo.docketNumber} onAnother={another} />);

  if (demo.phase === "consent") {
    return shell(
      <form onSubmit={(e) => void start(e)} className="card card-pad flex flex-col gap-5" data-testid="consent-step">
        <div className="grid gap-4 sm:grid-cols-2">
          <LanguageSelect value={language} onChange={setLanguage} />
          <DistrictSelect districts={districts} value={district} onChange={setDistrict} />
        </div>
        <ConsentFields value={consent} onChange={setConsent} need="voiceAnalysis" />
        {demo.error && <ErrorLine text={demo.error} />}
        {busy && (
          <div className="flex flex-wrap gap-2">
            <Link href="/demo/text" className="btn btn-secondary">
              <Keyboard className="size-4" aria-hidden /> Type instead
            </Link>
            {canTakeOver && (
              <button type="button" onClick={(e) => void start(e, true)} className="btn btn-secondary" data-testid="takeover">
                Take the line over (supervisor)
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={demo.busy || !district || !consent.voiceAnalysis} className="btn btn-primary btn-lg" data-testid="start">
          {demo.busy ? "Connecting…" : "Start the call"}
        </button>
        <p className="hint">Your browser will ask for the microphone. Speak as the caller; a demo call lasts up to three minutes.</p>
      </form>,
    );
  }

  return shell(
    <div className="flex flex-col gap-4">
      {demo.emergency && <EmergencyPanel panel={demo.emergency} />}
      <section className="flex flex-col items-center gap-4 py-2" aria-label="Call">
        {demo.phase === "input" && demo.interactionId && (
          <LiveRecorder
            interactionId={demo.interactionId}
            maxSeconds={MAX_LIVE_CALL_MS / 1000}
            send={(form) => fetch(`/api/demo/interactions/${demo.interactionId}/audio`, { method: "POST", body: form, credentials: "same-origin" }).catch(() => null)}
            onEmergency={(panel) => demo.receipt({ showEmergencyPanel: true, emergency: panel })}
            onFinished={() => demo.finish()}
            onFallback={(reason) =>
              setFallback(
                reason === "micRefused"
                  ? "The microphone is not available. Allow it in your browser, or type instead."
                  : reason === "needsConsent"
                    ? "Audio was refused: voice analysis consent is needed."
                    : "Voice analysis is unavailable right now. You can type instead.",
              )
            }
          />
        )}
        {demo.phase === "finishing" && <p className="text-ink-2">Registering the case…</p>}
        {fallback && (
          <div className="flex flex-col items-center gap-2">
            <ErrorLine text={fallback} />
            <Link href="/demo/text" className="btn btn-secondary btn-sm">
              <Keyboard className="size-4" aria-hidden /> Type a message instead
            </Link>
          </div>
        )}
        {demo.error && <ErrorLine text={demo.error} />}
      </section>
      <p className="hint text-center">Press Stop when you have said what you need to; the case is registered and you get a docket ID.</p>
    </div>,
  );
}
