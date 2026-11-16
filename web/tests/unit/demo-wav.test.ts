/** Task M.8 (gap V4): a recording is cut into standalone 5 s windows for the real audio path. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cutWav, encodeWav16, readWavInfo, resample, TARGET_RATE, WavError } from "@/core/demo/wav";

/** A test tone as a WAV file in any PCM layout. */
function tone(opts: { seconds: number; rate: number; channels?: number; bits?: 8 | 16 | 24 | 32; float?: boolean; hz?: number }): Uint8Array {
  const channels = opts.channels ?? 1;
  const bits = opts.float ? 32 : (opts.bits ?? 16);
  const frames = Math.round(opts.seconds * opts.rate);
  const step = bits / 8;
  const dataBytes = frames * channels * step;
  const out = new Uint8Array(44 + dataBytes);
  const v = new DataView(out.buffer);
  const put = (at: number, s: string) => [...s].forEach((ch, i) => (out[at + i] = ch.charCodeAt(0)));
  put(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, opts.float ? 3 : 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, opts.rate, true);
  v.setUint32(28, opts.rate * channels * step, true);
  v.setUint16(32, channels * step, true);
  v.setUint16(34, bits, true);
  put(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let f = 0; f < frames; f++) {
    const s = 0.5 * Math.sin((2 * Math.PI * (opts.hz ?? 220) * f) / opts.rate);
    for (let c = 0; c < channels; c++) {
      const at = 44 + (f * channels + c) * step;
      if (opts.float) v.setFloat32(at, s, true);
      else if (bits === 8) v.setUint8(at, Math.round(s * 127 + 128));
      else if (bits === 16) v.setInt16(at, Math.round(s * 32_767), true);
      else if (bits === 24) {
        const x = Math.round(s * 8_388_607);
        v.setUint8(at, x & 0xff);
        v.setUint8(at + 1, (x >> 8) & 0xff);
        v.setInt8(at + 2, x >> 16);
      } else v.setInt32(at, Math.round(s * 2_147_483_647), true);
    }
  }
  return out;
}

describe("cutWav (M.8)", () => {
  it("cuts 12 s into 5 + 5 + 2 s windows with the right offsets", () => {
    const { info, windows } = cutWav(tone({ seconds: 12, rate: 16_000 }));
    expect(info.durationMs).toBe(12_000);
    expect(windows.map((w) => [w.windowIndex, w.startMs, w.endMs])).toEqual([
      [0, 0, 5_000],
      [1, 5_000, 10_000],
      [2, 10_000, 12_000],
    ]);
  });

  it("drops a last piece shorter than one second", () => {
    const { windows } = cutWav(tone({ seconds: 10.6, rate: 16_000 }));
    expect(windows).toHaveLength(2);
  });

  it("turns 44.1 kHz stereo into 16 kHz mono windows under the 200 KB /audio limit", () => {
    const { info, windows } = cutWav(tone({ seconds: 11, rate: 44_100, channels: 2 }));
    expect(info).toMatchObject({ sampleRate: 44_100, channels: 2, bitsPerSample: 16 });
    for (const w of windows) {
      const out = readWavInfo(w.wav);
      expect(out).toMatchObject({ sampleRate: TARGET_RATE, channels: 1, bitsPerSample: 16, format: "int" });
      expect(w.wav.length).toBeLessThanOrEqual(200 * 1024);
    }
    expect(readWavInfo(windows[0]!.wav).durationMs).toBe(5_000);
  });

  it.each([
    ["8-bit", { bits: 8 as const }],
    ["24-bit", { bits: 24 as const }],
    ["32-bit integer", { bits: 32 as const }],
    ["32-bit float", { float: true }],
  ])("reads %s PCM and keeps the signal level", (_label, layout) => {
    const { windows } = cutWav(tone({ seconds: 2, rate: 16_000, ...layout }));
    const w = windows[0]!.wav;
    const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
    let peak = 0;
    for (let i = 44; i < w.length; i += 2) peak = Math.max(peak, Math.abs(v.getInt16(i, true)));
    expect(peak / 32_768).toBeGreaterThan(0.45);
    expect(peak / 32_768).toBeLessThan(0.55);
  });

  it("rejects files that are not plain WAV, are empty or are too long", () => {
    expect(() => cutWav(new TextEncoder().encode("hello, not audio"))).toThrow(WavError);
    const compressed = tone({ seconds: 1, rate: 16_000 });
    new DataView(compressed.buffer).setUint16(20, 85, true); // MP3 inside WAV
    expect(() => cutWav(compressed)).toThrow(/PCM/);
    expect(() => cutWav(tone({ seconds: 0.5, rate: 16_000 }))).toThrow(/shorter than one second/);
    expect(() => cutWav(tone({ seconds: 3, rate: 8_000 }), { maxDurationMs: 2_000 })).toThrow(/longer/);
  });

  it("cuts the synthetic fixture into 5 s windows of the same audio", () => {
    const fixture = new Uint8Array(readFileSync(resolve(__dirname, "../../../analysis-service/tests/fixtures/audio/pauses_en.wav")));
    const { info, windows } = cutWav(fixture);
    expect(windows).toHaveLength(Math.floor(info.durationMs / 5_000) + (info.durationMs % 5_000 >= 1_000 ? 1 : 0));
    // Already 16 kHz mono 16-bit: the first window's samples are the file's own first five seconds.
    const src = new DataView(fixture.buffer, fixture.byteOffset + info.dataOffset);
    const w = new DataView(windows[0]!.wav.buffer, 44);
    for (const i of [0, 1_000, 40_000, 79_999]) expect(Math.abs(w.getInt16(i * 2, true) - src.getInt16(i * 2, true))).toBeLessThanOrEqual(1);
  });
});

describe("resample and encodeWav16", () => {
  it("halves and doubles the sample count", () => {
    const x = new Float32Array(32_000).map((_, i) => Math.sin(i / 10));
    expect(resample(x, 32_000, 16_000)).toHaveLength(16_000);
    expect(resample(x, 8_000, 16_000)).toHaveLength(64_000);
    expect(resample(x, 16_000, 16_000)).toBe(x);
  });

  it("writes a header other tools can read", () => {
    const wav = encodeWav16(new Float32Array(16_000));
    expect(readWavInfo(wav)).toMatchObject({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, durationMs: 1_000, dataOffset: 44 });
  });
});
