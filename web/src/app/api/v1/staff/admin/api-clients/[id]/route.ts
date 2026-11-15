/** DELETE /api/v1/staff/admin/api-clients/{id} (task 8.6, §5.9): revoke the key at once (the record stays for audit). */
import { revokeApiClient } from "@/core/admin/users";
import { route } from "@/lib/route";

export const DELETE = route({ auth: "staff", action: "admin.users" }, async ({ user, params }) => {
  await revokeApiClient(user.id, String(params.id));
  return new Response(null, { status: 204 });
});
