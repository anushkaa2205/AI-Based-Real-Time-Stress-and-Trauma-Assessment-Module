"use client";

/**
 * Steps 3 to 5 for one input (`/start/write`, `/start/speak`; plan §6.3, §8.4). The conversation is
 * held in memory in the `/start` layout; after a reload or a direct visit there is nothing to show,
 * so the person is offered a fresh start.
 */
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PortalMode } from "@/contracts/portal";
import { SpeakConversation, WriteConversation } from "./conversation";
import { usePortal } from "./portal-provider";
import { PortalShell } from "./portal-shell";
import { Registered } from "./registered";
import { Review } from "./review";

export function Journey({ mode }: { mode: PortalMode }) {
  const p = usePortal();
  const t = useTranslations("portal");

  if (!p.interactionId || p.mode !== mode) {
    return (
      <PortalShell step="conversation">
        <section className="card card-pad flex flex-col items-start gap-3" data-testid="portal-lost">
          <h1 className="text-xl font-semibold text-ink">{t("lost.title")}</h1>
          <p className="text-ink-2">{t("lost.body")}</p>
          <Link href="/start" onClick={p.reset} className="btn btn-primary">
            <RotateCcw className="size-4" aria-hidden /> {t("lost.again")}
          </Link>
        </section>
      </PortalShell>
    );
  }

  if (p.stage === "registered" && p.docketNumber) {
    return (
      <PortalShell step="registered">
        <Registered docketNumber={p.docketNumber} onHome={p.reset} />
      </PortalShell>
    );
  }

  if (p.stage === "review") {
    return (
      <PortalShell step="review">
        <Review />
      </PortalShell>
    );
  }

  return <PortalShell step="conversation">{mode === "LIVE_TEXT" ? <WriteConversation /> : <SpeakConversation />}</PortalShell>;
}
