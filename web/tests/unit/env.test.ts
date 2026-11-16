import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const key = Buffer.alloc(32, 7).toString("base64");

const valid = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb+srv://u:p@cluster.example/",
  MONGODB_PII_URI: "mongodb+srv://u2:p2@cluster.example/",
  ENCRYPTION_KEYS: JSON.stringify({ k1: key }),
  ENCRYPTION_ACTIVE_KEY: "k1",
  AUTH_SECRET: "a".repeat(32),
  ANALYSIS_URL: "http://localhost:8000",
  ANALYSIS_HMAC_SECRET: "b".repeat(32),
  REALTIME_DRIVER: "sse",
  JOBS_SECRET: "c".repeat(32),
};

describe("parseEnv (task 0.5)", () => {
  it("accepts a complete configuration and decodes keys", () => {
    const env = parseEnv(valid);
    expect(env.ENCRYPTION_KEYS.k1?.length).toBe(32);
  });

  it("lists every missing variable by name", () => {
    expect(() => parseEnv({})).toThrowError(/MONGODB_URI[\s\S]*AUTH_SECRET[\s\S]*JOBS_SECRET/);
  });

  it("never echoes secret values in the error", () => {
    const bad = { ...valid, AUTH_SECRET: "shortxyz", MONGODB_URI: "http://not-mongo-secretvalue" };
    try {
      parseEnv(bad);
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("AUTH_SECRET");
      expect(msg).not.toContain("shortxyz");
      expect(msg).not.toContain("secretvalue");
    }
  });

  it("rejects an active key that is not in the key map", () => {
    expect(() => parseEnv({ ...valid, ENCRYPTION_ACTIVE_KEY: "k9" })).toThrowError(/ENCRYPTION_ACTIVE_KEY/);
  });

  it("rejects keys that are not 32 bytes", () => {
    const short = JSON.stringify({ k1: Buffer.alloc(16).toString("base64") });
    expect(() => parseEnv({ ...valid, ENCRYPTION_KEYS: short })).toThrowError(/32 bytes/);
  });

  it("requires Pusher keys when the driver is pusher", () => {
    expect(() => parseEnv({ ...valid, REALTIME_DRIVER: "pusher" })).toThrowError(/PUSHER_KEY/);
  });

  it("keeps the demo input layer off by default and needs its key when switched on (M.11, M.14)", () => {
    expect(parseEnv(valid).DEMO_ENABLED).toBe("false");
    expect(() => parseEnv({ ...valid, DEMO_ENABLED: "true" })).toThrowError(/DEMO_API_KEY/);
    expect(() => parseEnv({ ...valid, DEMO_ENABLED: "true", DEMO_API_KEY: "not-a-key" })).toThrowError(/DEMO_API_KEY/);
    const key = `nhaa_${"a".repeat(12)}.${"b".repeat(43)}`;
    expect(parseEnv({ ...valid, DEMO_ENABLED: "true", DEMO_API_KEY: key }).DEMO_API_KEY).toBe(key);
  });
});
