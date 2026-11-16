/** Demo input 3, play a recording (plan §6.3). Public; off (404) unless DEMO_ENABLED. */
import { notFound } from "next/navigation";
import { RecordedAudioDemo, type RecordedScenario } from "@/components/demo/recorded-audio-demo";
import { demoEnabled } from "@/core/demo/client";
import { listDistricts } from "@/core/demo/districts";
import { loadLibrary } from "@/core/demo/library";

export const metadata = { title: "Play a recording" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!demoEnabled()) notFound();
  const scenarios: RecordedScenario[] = loadLibrary().map((s) => ({ id: s.id, title: s.title, languageTag: s.languageTag, language: s.language, recordingAvailable: s.recordingAvailable }));
  return <RecordedAudioDemo scenarios={scenarios} districts={await listDistricts()} />;
}
