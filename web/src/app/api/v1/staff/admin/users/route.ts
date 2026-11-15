/** GET/POST /api/v1/staff/admin/users (task 8.6, §5.9). The temporary password and TOTP link are shown once. */
import { AdminUserCreate } from "@/contracts/staff";
import { createUser, listUsers } from "@/core/admin/users";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "admin.users" }, async () => ({ items: await listUsers() }));

export const POST = route({ auth: "staff", action: "admin.users", body: AdminUserCreate }, async ({ user, body }) =>
  Response.json(await createUser(user.id, body), { status: 201, headers: { "cache-control": "no-store" } }),
);
