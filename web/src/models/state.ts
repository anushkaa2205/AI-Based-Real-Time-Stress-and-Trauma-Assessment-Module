/** `states` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, base } from "./_shared";

const StateSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // "MH"
    name: { type: String, required: true },
  },
  base,
);

export const State = getModel("State", StateSchema, "states");
