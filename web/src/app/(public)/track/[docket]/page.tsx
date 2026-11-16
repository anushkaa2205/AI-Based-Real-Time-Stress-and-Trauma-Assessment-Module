/** One case's status (plan §6.4, task N.8). Public; off (404) unless DEMO_ENABLED. Wording from messages/*.json (English for the first deployment). */
import { notFound } from "next/navigation";
import { TrackResult } from "@/components/public/track-result";
import { DOCKET_PATTERN } from "@/core/cases/docket";
import { demoEnabled } from "@/core/demo/client";
import { MESSAGES } from "@/core/i18n/messages";

export const metadata = { title: "Track a case" };

export default async function Page({ params }: { params: Promise<{ docket: string }> }) {
  if (!demoEnabled()) notFound();
  const docket = decodeURIComponent((await params).docket).toUpperCase();
  if (!DOCKET_PATTERN.test(docket)) notFound();
  return <TrackResult docket={docket} t={MESSAGES.en.track} />;
}
