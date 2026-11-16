/**
 * Environment validation (task 0.5). Parsed once, on first use, and at server
 * start-up from `src/instrumentation.ts`, so a missing key fails loudly.
 * Error messages name the variables but never print their values (CLAUDE.md).
 */
import { z } from "zod";

const KEY_BYTES = 32;

const encryptionKeys = z.string().transform((raw, ctx) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    ctx.addIssue({ code: "custom", message: "must be a JSON object of keyId -> base64 key" });
    return z.NEVER;
  }
  const shape = z.record(z.string().regex(/^[A-Za-z0-9_-]{1,16}$/), z.string()).safeParse(parsed);
  if (!shape.success || Object.keys(shape.data).length === 0) {
    ctx.addIssue({ code: "custom", message: "must be a non-empty JSON object of keyId -> base64 key" });
    return z.NEVER;
  }
  const keys: Record<string, Buffer> = {};
  for (const [id, b64] of Object.entries(shape.data)) {
    const buf = Buffer.from(b64, "base64");
    if (buf.length !== KEY_BYTES) {
      ctx.addIssue({ code: "custom", message: `key "${id}" must decode to ${KEY_BYTES} bytes` });
      return z.NEVER;
    }
    keys[id] = buf;
  }
  return keys;
});

const secret = z.string().min(16, "must be at least 16 characters");

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Set to "1" by Vercel */
    VERCEL: z.string().optional(),
    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// or mongodb+srv:// URI"),
    MONGODB_PII_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// or mongodb+srv:// URI"),
    ENCRYPTION_KEYS: encryptionKeys,
    ENCRYPTION_ACTIVE_KEY: z.string().min(1),
    AUTH_SECRET: secret,
    ANALYSIS_URL: z.url(),
    ANALYSIS_HMAC_SECRET: secret,
    REALTIME_DRIVER: z.enum(["pusher", "sse"]).default("pusher"),
    PUSHER_APP_ID: z.string().optional(),
    PUSHER_KEY: z.string().optional(),
    PUSHER_SECRET: z.string().optional(),
    PUSHER_CLUSTER: z.string().optional(),
    JOBS_SECRET: secret,
    /** Demo input layer (PRODUCT_VISION.md §6): off unless "true"; the module never depends on it */
    DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
    /** The demo layer's own integration key (server-only); `npm run api:client -- --demo` writes it */
    DEMO_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (!(env.ENCRYPTION_ACTIVE_KEY in env.ENCRYPTION_KEYS)) {
      ctx.addIssue({ code: "custom", path: ["ENCRYPTION_ACTIVE_KEY"], message: "must be one of the ids in ENCRYPTION_KEYS" });
    }
    if (env.REALTIME_DRIVER === "pusher") {
      for (const k of ["PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when REALTIME_DRIVER=pusher" });
      }
    }
    if (env.DEMO_ENABLED === "true" && !/^nhaa_[a-f0-9]{12}\.[A-Za-z0-9_-]{20,100}$/.test(env.DEMO_API_KEY ?? "")) {
      ctx.addIssue({ code: "custom", path: ["DEMO_API_KEY"], message: "required when DEMO_ENABLED=true (run npm run api:client -- --demo)" });
    }
    // SSE cannot work on serverless hosting (ADR-6); it is fine for a local production build.
    if (env.VERCEL === "1" && env.REALTIME_DRIVER === "sse") {
      ctx.addIssue({ code: "custom", path: ["REALTIME_DRIVER"], message: "sse is for local use only; use pusher on Vercel" });
    }
  });

export type Env = z.output<typeof EnvSchema>;

/** Parses an env object; throws an Error listing problems by variable name only. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new Error(
      `Invalid environment configuration. Copy web/.env.example to web/.env.local and fix:\n${lines.join("\n")}`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated environment for server code. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
