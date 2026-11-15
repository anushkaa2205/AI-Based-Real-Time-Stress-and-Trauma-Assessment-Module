/** GET/POST /api/v1/staff/admin/api-clients (task 8.6, §5.9). The key is shown once, at creation. */
import { ApiClientCreate } from "@/contracts/staff";
import { createApiClient, listApiClients } from "@/core/admin/users";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "admin.users" }, async () => ({ items: await listApiClients() }));

export const POST = route({ auth: "staff", action: "admin.users", body: ApiClientCreate }, async ({ user, body }) =>
  Response.json(await createApiClient(user.id, body), { status: 201, headers: { "cache-control": "no-store" } }),
);
