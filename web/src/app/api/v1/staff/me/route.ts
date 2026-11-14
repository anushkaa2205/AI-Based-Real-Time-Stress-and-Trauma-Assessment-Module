/** GET /api/v1/staff/me (API_CONTRACTS §5.1, task 1.11). */
import type { Me } from "@/contracts/staff";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "staff.self" }, async ({ user }): Promise<Me> => ({
  id: user.id,
  name: user.name,
  role: user.role,
  districtId: user.districtId ?? null,
  stateId: user.stateId ?? null,
  languages: user.languages,
  isOnDuty: user.isOnDuty,
}));
