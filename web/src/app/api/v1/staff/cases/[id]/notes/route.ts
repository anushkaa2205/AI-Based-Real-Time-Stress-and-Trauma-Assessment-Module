/** GET/POST /api/v1/staff/cases/{id}/notes (task 5.5, FR-CASE-04). Notes are stored encrypted. */
import { NoteRequest } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { userNames, userRef } from "@/core/cases/dto";
import { loadCaseResource } from "@/core/cases/resource";
import { decrypt, encrypt } from "@/core/privacy/crypto";
import { route } from "@/lib/route";
import { Case, CaseNote } from "@/models";

export const GET = route({ auth: "staff", action: "case.review" }, async ({ params, authorize }) => {
  const loaded = await loadCaseResource(String(params.id));
  authorize("case.review", loaded.resource);
  authorize("case.read", loaded.resource);
  const notes = await CaseNote.find({ caseId: loaded.caseDoc._id }).sort({ createdAt: -1 }).limit(200).lean();
  const names = await userNames(notes.map((n) => n.authorId));
  return {
    items: notes.map((n) => ({ id: String(n._id), body: n.bodyEnc ? decrypt(n.bodyEnc) : "[Removed after the retention period]", author: userRef(n.authorId, names), createdAt: new Date(n.createdAt).toISOString() })),
  };
});

export const POST = route({ auth: "staff", action: "case.review", body: NoteRequest }, async ({ user, params, body, authorize }) => {
  const loaded = await loadCaseResource(String(params.id));
  authorize("case.review", loaded.resource);
  authorize("case.read", loaded.resource);
  const note = await CaseNote.create({ caseId: loaded.caseDoc._id, authorId: user.id, bodyEnc: encrypt(body.body) });
  await Case.updateOne({ _id: loaded.caseDoc._id }, { $set: { waitingSince: new Date() } });
  await record({ actorType: "USER", actorId: user.id, action: "note.create", entityType: "case", entityId: String(loaded.caseDoc._id) });
  return Response.json(
    { id: String(note._id), body: body.body, author: { id: user.id, name: user.name }, createdAt: new Date(note.createdAt).toISOString() },
    { status: 201 },
  );
});
