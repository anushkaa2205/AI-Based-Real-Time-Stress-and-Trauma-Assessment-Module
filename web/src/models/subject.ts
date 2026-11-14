/** `subjects` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, appendOnly } from "./_shared";

/** Pseudonymous person. Every other collection references only this _id. */
const SubjectSchema = new Schema({}, appendOnly);

export const Subject = getModel("Subject", SubjectSchema, "subjects");
