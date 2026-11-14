/** `districts` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, ObjectId, base } from "./_shared";

const DistrictSchema = new Schema(
  {
    stateId: { type: ObjectId, ref: "State", required: true, index: true },
    code: { type: String, required: true, unique: true }, // LGD code
    name: { type: String, required: true },
  },
  base,
);

export const District = getModel("District", DistrictSchema, "districts");
