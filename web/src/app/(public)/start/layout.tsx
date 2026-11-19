/**
 * The portal journey (Phase P, task P.7; NIVARA_FLOW_AND_UI_PLAN.md §5, §6.3). Public; off (404)
 * unless PORTAL_ENABLED. The layout holds the conversation in memory across `/start`, `/start/write`
 * and `/start/speak`. Part of the Nivara portal, not of the module.
 */
import { notFound } from "next/navigation";
import { PortalProvider } from "@/components/portal/portal-provider";
import { portalEnabled } from "@/core/portal/client";

export const dynamic = "force-dynamic";

export default function StartLayout({ children }: { children: React.ReactNode }) {
  if (!portalEnabled()) notFound();
  return <PortalProvider>{children}</PortalProvider>;
}
