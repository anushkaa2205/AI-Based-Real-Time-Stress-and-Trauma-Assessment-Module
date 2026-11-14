/**
 * GET /api/v1/staff/cases/{id}/identity (task 5.8, NFR-PRI-03, DATABASE §8.2).
 * Supervisors, or the assigned counsellor with the victim's sharing consent.
 * The only read of the PII vault; every read is audited as identity.view.
 */
import { record } from "@/core/audit/record";
import { loadCaseResource } from "@/core/cases/resource";
import { decrypt } from "@/core/privacy/crypto";
import { piiDb } from "@/lib/pii-db";
import { route } from "@/lib/route";
import { SubjectIdentity } from "@/models/subject-identity";

const open = (v: string | null | undefined) => (v ? decrypt(v) : null);

export const GET = route({ auth: "staff", action: "identity.read" }, async ({ user, params, authorize }) => {
  const loaded = await loadCaseResource(String(params.id));
  authorize("identity.read", loaded.resource);
  await piiDb();
  const id = await SubjectIdentity().findById(loaded.caseDoc.subjectId).lean();
  await record({ actorType: "USER", actorId: user.id, action: "identity.view", entityType: "case", entityId: String(loaded.caseDoc._id) });
  return { fullName: open(id?.fullNameEnc), phone: open(id?.phoneEnc), address: open(id?.addressEnc) };
});
