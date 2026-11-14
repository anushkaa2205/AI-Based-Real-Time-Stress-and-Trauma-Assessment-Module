/** POST /api/v1/staff/auth/logout (API_CONTRACTS §5.1). */
import { signOut } from "@/auth";
import { route } from "@/lib/route";

export const POST = route({ auth: "public", rateLimit: false }, async () => {
  await signOut({ redirect: false });
  return new Response(null, { status: 204 });
});
