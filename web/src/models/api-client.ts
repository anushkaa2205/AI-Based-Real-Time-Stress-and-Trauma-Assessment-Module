/** `api_clients` collection (split from docs/models.ts, task 1.2). */
import { Schema } from "mongoose";
import { getModel, base } from "./_shared";

const ApiClientSchema = new Schema(
  {
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true, unique: true },
    keyHash: { type: String, required: true, select: false }, // FR-API-02
    scopes: { type: [String], default: [] }, // "interactions:write", "assessments:read", …
    rateLimitPerMin: { type: Number, default: 120 },
    isActive: { type: Boolean, default: true },
    /** Task M.7: the demo input layer's client. Everything it creates is tagged demo, on the server. */
    isDemo: { type: Boolean, default: false },
  },
  base,
);

export const ApiClient = getModel("ApiClient", ApiClientSchema, "api_clients");
