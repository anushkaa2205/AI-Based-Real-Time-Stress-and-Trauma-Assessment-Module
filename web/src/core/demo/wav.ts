/**
 * Cuts a recorded WAV file into 5-second windows for the real audio path (task M.8, gap V4,
 * API_CONTRACTS §6.5). Demo layer only; the module never imports this.
 *
 * Pure: bytes in, windows out. Accepts PCM WAV (8/16/24/32-bit integer or 32-bit float, any
 * channel count, any sample rate) and turns every window into a standalone 16 kHz, 16-bit, mono
 * WAV, so a 5 s window is 160 KB, inside the 200 KB limit of `/audio`. Channels are averaged;
 * the rate is changed with a box filter (down) or linear interpolation (up), enough for speech.
 * The real audio is sent; nothing here transcribes or invents anything.
 */

export const TARGET_RATE = 16_000;
export const WINDOW_MS = 5_000;
/** A last piece shorter than this is dropped (too short to analyse). */
export const MIN_TAIL_MS = 1_000;
/** Ten minutes is plenty for a demo scenario. */
export const MAX_DURATION_MS = 10 * 60_000;

export type WavErrorCode = "NOT_WAV" | "UNSUPPORTED_FORMAT" | "NO_AUDIO" | "TOO_LONG";

export class WavError extends Error {
  constructor(
    readonly code: WavErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WavError";
  }
}

export interface WavInfo {
  format: "int" | "float";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
  durationMs: number;
}

export interface AudioWindow {
  windowIndex: number;
  startMs: number;
  endMs: number;
  /** A complete 16 kHz mono 16-bit WAV file */
  wav: Uint8Array;
}

const PCM = 1;
const IEEE_FLOAT = 3;
const EXTENSIBLE = 0xfffe;

function ascii(b: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...b.subarray(at, at + len));
}

/** Reads the header; throws WavError for anything that is not plain PCM or float WAV. */
export function readWavInfo(bytes: Uint8Array): WavInfo {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") throw new WavError("NOT_WAV", "Not a WAV file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  let fmt: { tag: number; channels: number; rate: number; bits: number } | null = null;
  let data: { offset: number; length: number } | null = null;
  while (pos + 8 <= bytes.length) {
    const id = ascii(bytes, pos, 4);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      let tag = view.getUint16(body, true);
      if (tag === EXTENSIBLE && size >= 40 && body + 26 <= bytes.length) tag = view.getUint16(body + 24, true); // sub-format GUID starts with the tag
      fmt = { tag, channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    }
    if (id === "data") {
      data = { offset: body, length: Math.min(size, bytes.length - body) };
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new WavError("NOT_WAV", "The WAV file has no format or data section");
  const isInt = fmt.tag === PCM && [8, 16, 24, 32].includes(fmt.bits);
  const isFloat = fmt.tag === IEEE_FLOAT && fmt.bits === 32;
  if (!isInt && !isFloat) throw new WavError("UNSUPPORTED_FORMAT", "Use PCM WAV (16-bit is best); compressed WAV is not supported");
  if (fmt.channels < 1 || fmt.channels > 8 || fmt.rate < 8_000 || fmt.rate > 192_000) throw new WavError("UNSUPPORTED_FORMAT", "Unusual channel count or sample rate");
  const frameBytes = (fmt.bits / 8) * fmt.channels;
  const frames = Math.floor(data.length / frameBytes);
  if (frames === 0) throw new WavError("NO_AUDIO", "The WAV file holds no audio");
  return {
    format: isFloat ? "float" : "int",
    sampleRate: fmt.rate,
    channels: fmt.channels,
    bitsPerSample: fmt.bits,
    dataOffset: data.offset,
    dataLength: frames * frameBytes,
    durationMs: Math.round((frames / fmt.rate) * 1000),
  };
}

/** One sample at byte `at`, scaled to [-1, 1]. */
function sampleAt(view: DataView, at: number, info: WavInfo): number {
  if (info.format === "float") return Math.max(-1, Math.min(1, view.getFloat32(at, true)));
  switch (info.bitsPerSample) {
    case 8:
      return (view.getUint8(at) - 128) / 128;
    case 16:
      return view.getInt16(at, true) / 32_768;
    case 24: {
      const v = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16);
      return v / 8_388_608;
    }
    default:
      return view.getInt32(at, true) / 2_147_483_648;
  }
}

/** Whole file → mono float samples at the file's own rate (channels averaged). */
export function toMono(bytes: Uint8Array, info: WavInfo): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const step = info.bitsPerSample / 8;
  const frameBytes = step * info.channels;
  const frames = info.dataLength / frameBytes;
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = info.dataOffset + f * frameBytes;
    for (let c = 0; c < info.channels; c++) sum += sampleAt(view, base + c * step, info);
    out[f] = sum / info.channels;
  }
  return out;
}

/** Changes the sample rate: box-filter average when going down, linear interpolation when going up. */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  if (ratio > 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio);
      const b = Math.max(a + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = a; j < b; j++) sum += input[j]!;
      out[i] = sum / (b - a);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const x = i * ratio;
      const a = Math.floor(x);
      const b = Math.min(input.length - 1, a + 1);
      out[i] = input[a]! + (input[b]! - input[a]!) * (x - a);
    }
  }
  return out;
}

/** 16-bit mono PCM WAV file for `samples` at `rate`. */
export function encodeWav16(samples: Float32Array, rate: number = TARGET_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const v = new DataView(out.buffer);
  const put = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  put(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, PCM, true);
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true);
  put(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, Math.round(s < 0 ? s * 32_768 : s * 32_767), true);
  }
  return out;
}

/** The whole recording → ordered 5 s windows, each a standalone 16 kHz mono WAV (M.8). */
export function cutWav(bytes: Uint8Array, opts: { windowMs?: number; minTailMs?: number; maxDurationMs?: number } = {}): { info: WavInfo; windows: AudioWindow[] } {
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const minTailMs = opts.minTailMs ?? MIN_TAIL_MS;
  const info = readWavInfo(bytes);
  if (info.durationMs > (opts.maxDurationMs ?? MAX_DURATION_MS)) throw new WavError("TOO_LONG", "The recording is longer than 10 minutes");
  const mono = resample(toMono(bytes, info), info.sampleRate, TARGET_RATE);
  const per = Math.round((TARGET_RATE * windowMs) / 1000);
  const minTail = Math.round((TARGET_RATE * minTailMs) / 1000);
  const windows: AudioWindow[] = [];
  for (let start = 0, i = 0; start < mono.length; start += per, i++) {
    const piece = mono.subarray(start, Math.min(mono.length, start + per));
    if (piece.length < minTail) break;
    const startMs = Math.round((start / TARGET_RATE) * 1000);
    windows.push({ windowIndex: i, startMs, endMs: startMs + Math.round((piece.length / TARGET_RATE) * 1000), wav: encodeWav16(piece) });
  }
  if (!windows.length) throw new WavError("NO_AUDIO", "The recording is shorter than one second");
  return { info, windows };
}
