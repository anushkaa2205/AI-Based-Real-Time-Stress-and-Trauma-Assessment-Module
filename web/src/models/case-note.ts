/** `case_notes` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, appendOnly } from "./_shared";

const CaseNoteSchema = new Schema(
  {
    caseId: { type: ObjectId, ref: "Case", required: true },
    authorId: { type: ObjectId, ref: "User", required: true },
    // Cleared (null) by the retention job after the retention period (task 8.7, NFR-PRI-04)
    bodyEnc: { type: String, default: null },
    purgedAt: Date,
  },
  appendOnly,
);
CaseNoteSchema.index({ caseId: 1, createdAt: -1 });

export const CaseNote = getModel("CaseNote", CaseNoteSchema, "case_notes");
