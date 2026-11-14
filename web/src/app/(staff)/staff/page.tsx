/** /staff sends each role to its own home page (task 1.11). */
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/staff-nav";
import { currentStaff } from "@/lib/staff-session";

export default async function StaffHome() {
  const user = await currentStaff();
  redirect(user ? homeFor(user.role) : "/login");
}
