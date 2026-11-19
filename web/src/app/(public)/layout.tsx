/** Public shell (NIVARA_FLOW_AND_UI_PLAN.md §6.1): navbar, page, footer. Part of the Nivara portal, not of the module. */
import { SiteFooter } from "@/components/public/site-footer";
import { SiteNav } from "@/components/public/site-nav";
import { portalEnabled } from "@/core/portal/client";
import { currentStaff } from "@/lib/staff-session";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await currentStaff();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteNav signedIn={!!user} portalOn={portalEnabled()} />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
