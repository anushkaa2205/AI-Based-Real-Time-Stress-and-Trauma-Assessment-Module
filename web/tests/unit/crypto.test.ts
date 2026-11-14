import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DecryptionError,
  decryptWith,
  encryptWith,
  isEncrypted,
  keyIdOf,
  reencryptWith,
  type Keyring,
} from "@/core/privacy/crypto";

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const ringK1: Keyring = { keys: { k1 }, activeKeyId: "k1" };
const ringRotated: Keyring = { keys: { k1, k2 }, activeKeyId: "k2" };

// Synthetic text only (CLAUDE.md rule 11).
const samples = ["Synthetic test message", "यह एक परीक्षण संदेश है", "mujhe dar lag raha hai (test)", ""];

describe("field encryption (task 1.3)", () => {
  it.each(samples)("round-trips %j", (plain) => {
    const token = encryptWith(ringK1, plain);
    expect(isEncrypted(token)).toBe(true);
    expect(token).not.toContain(plain || "\u0000");
    expect(decryptWith(ringK1, token)).toBe(plain);
  });

  it("uses a fresh IV, so equal plaintexts give different tokens", () => {
    expect(encryptWith(ringK1, "same")).not.toBe(encryptWith(ringK1, "same"));
  });

  it("fails with the wrong key", () => {
    const token = encryptWith(ringK1, "secret");
    const wrong: Keyring = { keys: { k1: randomBytes(32) }, activeKeyId: "k1" };
    expect(() => decryptWith(wrong, token)).toThrow(DecryptionError);
  });

  it("fails on an unknown key id", () => {
    const token = encryptWith(ringRotated, "secret");
    expect(() => decryptWith(ringK1, token)).toThrow(/unknown key id/);
  });

  it("fails when the ciphertext is tampered with", () => {
    const token = encryptWith(ringK1, "secret value");
    const parts = token.split(":");
    const data = Buffer.from(parts[5]!, "base64");
    data[0] = data[0]! ^ 0xff;
    parts[5] = data.toString("base64");
    expect(() => decryptWith(ringK1, parts.join(":"))).toThrow(DecryptionError);
  });

  it("fails when the auth tag is tampered with", () => {
    const parts = encryptWith(ringK1, "secret").split(":");
    const tag = Buffer.from(parts[4]!, "base64");
    tag[3] = tag[3]! ^ 0x01;
    parts[4] = tag.toString("base64");
    expect(() => decryptWith(ringK1, parts.join(":"))).toThrow(DecryptionError);
  });

  it("rejects values that are not tokens", () => {
    expect(() => decryptWith(ringK1, "plain text")).toThrow(/not an encrypted value/);
  });

  it("still decrypts values written with an old key after rotation", () => {
    const old = encryptWith(ringK1, "written before rotation");
    expect(keyIdOf(old)).toBe("k1");
    expect(decryptWith(ringRotated, old)).toBe("written before rotation");
    const fresh = encryptWith(ringRotated, "after rotation");
    expect(keyIdOf(fresh)).toBe("k2");
  });

  it("re-encrypts old values with the active key", () => {
    const old = encryptWith(ringK1, "rotate me");
    const rotated = reencryptWith(ringRotated, old);
    expect(keyIdOf(rotated)).toBe("k2");
    expect(decryptWith(ringRotated, rotated)).toBe("rotate me");
    expect(reencryptWith(ringRotated, rotated)).toBe(rotated);
  });

  it("error messages never contain the plaintext", () => {
    const token = encryptWith(ringK1, "do-not-leak");
    try {
      decryptWith({ keys: { k1: randomBytes(32) }, activeKeyId: "k1" }, token);
    } catch (e) {
      expect((e as Error).message).not.toContain("do-not-leak");
      expect((e as Error).message).not.toContain(token);
    }
  });
});
