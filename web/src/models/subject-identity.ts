/**
 * `subject_identities`: the PII vault (NFR-PRI-03, DATABASE.md §8.2).
 * The ONLY place names, phones and addresses are stored, always encrypted.
 * Bound to the separate `nhaa_pii` connection, never the default one.
 */
import { Schema, type Connection, type InferSchemaType } from "mongoose";
import { piiConnection } from "@/lib/pii-db";
import { ObjectId, base } from "./_shared";

export const SubjectIdentitySchema = new Schema(
  {
    _id: { type: ObjectId, ref: "Subject" }, // same _id as the Subject
    fullNameEnc: String,
    phoneEnc: String,
    phoneHash: { type: String, index: true }, // HMAC, for de-duplication without decrypting
    addressEnc: String,
  },
  base,
);

export type SubjectIdentityDoc = InferSchemaType<typeof SubjectIdentitySchema>;

function register(conn: Connection) {
  return conn.model("SubjectIdentity", SubjectIdentitySchema, "subject_identities");
}
type SubjectIdentityModel = ReturnType<typeof register>;

/** The SubjectIdentity model on the PII connection (created on first use). */
export function SubjectIdentity(): SubjectIdentityModel {
  const conn = piiConnection();
  return (conn.models.SubjectIdentity as SubjectIdentityModel | undefined) ?? register(conn);
}
