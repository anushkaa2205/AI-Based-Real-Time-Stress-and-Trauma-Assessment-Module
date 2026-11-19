/** One case's status (plan §6.4, task N.8). Public; off (404) unless PORTAL_ENABLED. Wording from messages/*.json in the site language (P.5). */
import { notFound } from "next/navigation";
import { TrackResult } from "@/components/public/track-result";
import { DOCKET_PATTERN } from "@/core/cases/docket";
import { portalEnabled } from "@/core/portal/client";
import { getLocale, getTranslations } from "next-intl/server";
import { toVictimLang } from "@/contracts/interaction";
import { MESSAGES } from "@/core/i18n/messages";

export async function generateMetadata() {
  return { title: (await getTranslations("public.meta"))("track") };
}

export default async function Page({ params }: { params: Promise<{ docket: string }> }) {
  if (!portalEnabled()) notFound();
  const docket = decodeURIComponent((await params).docket).toUpperCase();
  if (!DOCKET_PATTERN.test(docket)) notFound();
  return <TrackResult docket={docket} t={MESSAGES[toVictimLang(await getLocale())].track} />;
}
