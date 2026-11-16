/** Staff sign-in (plan §6.5, task N.9). A signed-in visitor goes straight to their portal. */
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff-session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Staff sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentStaff()) redirect("/staff");
  return <LoginForm />;
}
