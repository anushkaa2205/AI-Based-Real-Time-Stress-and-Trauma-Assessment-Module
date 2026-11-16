/** Task M.6 (gap V2): input method on /messages and /audio, separate from channel and modality. */
import { describe, expect, it } from "vitest";
import { INTEGRATION_CONTRACT_VERSION, IntegrationMessage } from "@/contracts/integration";
import { AudioFields } from "@/contracts/interaction";

describe("integration contract 1.1 (M.6)", () => {
  it("states a version", () => {
    expect(INTEGRATION_CONTRACT_VERSION).toMatch(/^1\.\d+$/);
  });

  it("text messages are TEXT unless the calling system says TRANSCRIPT", () => {
    expect(IntegrationMessage.parse({ text: "hello" }).inputMethod).toBe("TEXT");
    expect(IntegrationMessage.parse({ text: "hello", inputMethod: "TRANSCRIPT" }).inputMethod).toBe("TRANSCRIPT");
    // Audio methods belong on /audio; structured answers do not exist (PRODUCT_VISION.md Q1).
    for (const bad of ["LIVE_AUDIO", "RECORDED_AUDIO", "STRUCTURED"]) expect(IntegrationMessage.safeParse({ text: "hello", inputMethod: bad }).success).toBe(false);
  });

  it("audio windows are LIVE_AUDIO unless cut from a recording", () => {
    expect(AudioFields.parse({ windowIndex: "0", startMs: "0" }).inputMethod).toBe("LIVE_AUDIO");
    expect(AudioFields.parse({ windowIndex: "0", startMs: "0", inputMethod: "RECORDED_AUDIO" }).inputMethod).toBe("RECORDED_AUDIO");
    expect(AudioFields.safeParse({ windowIndex: "0", startMs: "0", inputMethod: "TEXT" }).success).toBe(false);
  });
});
