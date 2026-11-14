/** Staff shell: sidebar that changes per role (task 1.11). */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_LABEL, navFor } from "@/lib/staff-nav";
import { currentStaff } from "@/lib/staff-session";
import { SignOutButton } from "./sign-out-button";

export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const user = await currentStaff();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-border p-4 md:w-60 md:border-b-0 md:border-r">
        <div>
          <p className="font-semibold">NHAA Assist</p>
          <p className="text-sm text-muted-foreground">
            {user.name} · {ROLE_LABEL[user.role]}
          </p>
        </div>
        <nav aria-label="Staff">
          <ul className="flex flex-col gap-1">
            {navFor(user.role).map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="md:mt-auto">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
