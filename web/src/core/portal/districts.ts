/** The seeded districts a portal case may belong to (NIVARA_FLOW_AND_UI_PLAN.md §8.4). Portal only. */
import type { DistrictOption } from "@/components/portal/consent-fields";
import { db } from "@/lib/db";
import { District, State } from "@/models";

export async function listDistricts(): Promise<DistrictOption[]> {
  await db();
  const [districts, states] = await Promise.all([District.find().select("code name stateId").sort({ code: 1 }).lean(), State.find().select("name").lean()]);
  const stateName = new Map(states.map((s) => [String(s._id), s.name as string]));
  return districts.map((d) => ({ code: d.code as string, name: d.name as string, state: stateName.get(String(d.stateId)) ?? "" }));
}
