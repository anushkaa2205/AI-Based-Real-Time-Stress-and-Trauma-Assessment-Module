/** Schema checks that need no database connection (task 1.2). */
import mongoose, { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { ASSESS_MODELS, AuditLog, Case, Indicator, Interaction, ScoringConfig } from "@/models";
import { SubjectIdentitySchema } from "@/models/subject-identity";

const indexKeys = (model: { schema: mongoose.Schema }) => model.schema.indexes().map(([fields]) => fields);

describe("models (task 1.2)", () => {
  it("registers every assessment collection, and never the PII vault, on the default connection", () => {
    const names = ASSESS_MODELS.map((m) => m.collection.collectionName);
    expect(names).toContain("cases");
    expect(names).not.toContain("subject_identities");
    expect(mongoose.models.SubjectIdentity).toBeUndefined();
  });

  it("keeps identifiers out of assessment collections (AC-PRI-01)", () => {
    const pii = /^(fullName|name|phone|address)/i;
    for (const model of ASSESS_MODELS) {
      // Staff users, places and API clients have names; victims never do outside the vault.
      if (["User", "State", "District", "ApiClient"].includes(model.modelName)) continue;
      const fields = Object.keys(model.schema.paths);
      expect(fields.filter((f) => pii.test(f)), model.modelName).toEqual([]);
    }
    expect(Object.keys(SubjectIdentitySchema.paths)).toEqual(
      expect.arrayContaining(["fullNameEnc", "phoneEnc", "addressEnc", "phoneHash"]),
    );
  });

  it("has no caste or community field anywhere (C-ETH-03)", () => {
    for (const model of ASSESS_MODELS) {
      for (const path of Object.keys(model.schema.paths)) {
        expect(path, model.modelName).not.toMatch(/caste|community|jati|tribe/i);
      }
    }
  });

  it("defines the risk-sorted queue index", () => {
    expect(indexKeys(Case)).toContainEqual({ status: 1, bandRank: -1, currentSvi: -1, waitingSince: 1 });
  });

  it("makes the audit chain unable to fork (unique prevHash)", () => {
    expect(AuditLog.schema.path("prevHash").options.unique).toBe(true);
  });

  it("allows only one active scoring config", () => {
    const active = ScoringConfig.schema.indexes().find(([f]) => "isActive" in f);
    expect(active?.[1]).toMatchObject({ unique: true, partialFilterExpression: { isActive: true } });
  });

  it("requires a band-override reason of at least 5 characters (FR-CASE-04)", () => {
    const c = new Case({
      docketNumber: "TEST-0001",
      subjectId: new Types.ObjectId(),
      bandOverrides: [{ fromBand: "HIGH", toBand: "LOW", reason: "ok", byUserId: new Types.ObjectId() }],
    });
    expect(c.validateSync()?.errors["bandOverrides.0.reason"]).toBeDefined();
  });

  it("rejects indicator scores outside 0-1 and unknown dimensions", () => {
    const ind = new Indicator({
      interactionId: new Types.ObjectId(),
      caseId: new Types.ObjectId(),
      dimension: "NOT_A_DIMENSION",
      source: "TEXT_NLP",
      score: 1.4,
      confidence: 0.5,
      evidence: { type: "TEXT_SPAN" },
      modelVersion: "test",
    });
    const errors = ind.validateSync()?.errors ?? {};
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(["dimension", "score"]));
  });

  it("defaults a new interaction to SAFETY_ONLY mode until consent (rule 6)", () => {
    const i = new Interaction({ caseId: new Types.ObjectId(), subjectId: new Types.ObjectId(), channel: "CHATBOT", uiLanguage: "hi" });
    expect(i.mode).toBe("SAFETY_ONLY");
  });
});
