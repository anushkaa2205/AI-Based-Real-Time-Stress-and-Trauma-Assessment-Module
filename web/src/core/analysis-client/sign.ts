/**
 * Signs requests to the analysis service (task 4.1). Must match
 * analysis-service/app/security.py:
 *   X-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${body}`)>
 */
import { createHmac } from "node:crypto";

export function signBody(secret: string, timestamp: string, body: string | Uint8Array): string {
  const h = createHmac("sha256", secret).update(`${timestamp}.`);
  return `sha256=${h.update(body).digest("hex")}`;
}

/** Same signature over raw bytes (multipart audio, task 7.5). */
export function signedBinaryHeaders(secret: string, body: Uint8Array, contentType: string, nowMs: number): Record<string, string> {
  const ts = String(Math.floor(nowMs / 1000));
  return { "content-type": contentType, "x-timestamp": ts, "x-signature": signBody(secret, ts, body) };
}

export function signedHeaders(secret: string, body: string, nowMs: number): Record<string, string> {
  const ts = String(Math.floor(nowMs / 1000));
  return { "content-type": "application/json", "x-timestamp": ts, "x-signature": signBody(secret, ts, body) };
}
