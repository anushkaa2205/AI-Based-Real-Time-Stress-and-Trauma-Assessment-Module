/** Shared schema options and helpers for every model (split from docs/models.ts). */
import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const { ObjectId } = Schema.Types;

/** createdAt/updatedAt, no __v noise in API output */
export const base = { timestamps: true, versionKey: false } as const;
/** Append-only collections: createdAt only (DATABASE.md §1 "Immutability") */
export const appendOnly = { timestamps: { createdAt: true, updatedAt: false }, versionKey: false } as const;

/** Prevents "OverwriteModelError" during Next.js hot reload */
export function getModel<T extends Schema>(name: string, schema: T, collection: string) {
  return (mongoose.models[name] as Model<InferSchemaType<T>>) ?? model(name, schema, collection);
}
