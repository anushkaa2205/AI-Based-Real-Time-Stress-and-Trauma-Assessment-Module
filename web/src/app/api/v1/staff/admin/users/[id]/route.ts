/** PATCH /api/v1/staff/admin/users/{id} (task 8.6, §5.9): change role or district, deactivate, reset password. */
import { AdminUserPatch } from "@/contracts/staff";
import { updateUser } from "@/core/admin/users";
import { route } from "@/lib/route";

export const PATCH = route({ auth: "staff", action: "admin.users", body: AdminUserPatch }, async ({ user, params, body }) =>
  Response.json(await updateUser(user.id, String(params.id), body), { headers: { "cache-control": "no-store" } }),
);
