/** Empty role home page used until each dashboard is built (Phases 5–8). */
import { STAFF_PAGES, type StaffPageKey } from "@/lib/staff-nav";
import { requirePage } from "@/lib/staff-session";

export async function RoleHome({ page, comingIn }: { page: StaffPageKey; comingIn: string }) {
  await requirePage(page);
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{STAFF_PAGES[page].label}</h1>
      <p className="text-muted-foreground">Nothing here yet. This page is built in {comingIn}.</p>
    </section>
  );
}
