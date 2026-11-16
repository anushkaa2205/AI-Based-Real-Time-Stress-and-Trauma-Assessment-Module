/**
 * Who may subscribe to which channel (task 5.1). Same policies as the REST API
 * (API_CONTRACTS §7: "applies the §4 policies"). Staff only; there are no victim channels.
 */
import { loadInteractionResource } from "@/core/cases/resource";
import { access, listScope } from "@/core/policies/rbac";
import type { StaffUser } from "@/lib/staff-session";
import { parseChannel } from "./channels";

export async function staffCanSubscribe(user: StaffUser, channel: string): Promise<boolean> {
  const c = parseChannel(channel);
  if (!c) return false;
  switch (c.kind) {
    case "oncall":
      return access(user, "alert.read") === "full";
    case "supervisors":
      return user.role === "NHAA_SUPERVISOR";
    case "role":
      return user.role === c.role && user.districtId === c.districtId;
    case "queue": {
      const scope = listScope(user, "case.list");
      if (!scope) return false;
      if (c.districtId === null) return scope.kind === "all";
      return scope.kind === "all" || (scope.kind === "district" && scope.districtId === c.districtId);
    }
    case "interaction": {
      // Full assessment updates (dimensions, evidence labels): full access only.
      try {
        const { resource } = await loadInteractionResource(c.id);
        return access(user, "case.read", resource) === "full" && access(user, "case.assessment.read", resource) === "full";
      } catch {
        return false;
      }
    }
  }
}
