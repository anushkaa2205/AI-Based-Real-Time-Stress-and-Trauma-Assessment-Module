/**
 * Recorded audio library for the demo input layer (task M.14, API_CONTRACTS §6.5,
 * PRODUCT_VISION.md §6 and §9). Demo layer only; the module never imports this.
 *
 * `demo/library/library.json` lists evaluation scenarios. Each scenario's conversation is the
 * script the team reads aloud, and its `expected` block is the label fixed before any run:
 * test metadata, never sent to the module. Recordings (`demo/library/audio/<id>.wav`) are the
 * team's own voices, git-ignored. Audio is never generated.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { toVictimLang, type VictimLang } from "@/contracts/interaction";

/** Repository root, seen from the Next.js app in `web/`. */
const ROOT = resolve(process.cwd(), "..");
export const LIBRARY_DIR = resolve(ROOT, "demo", "library");
const SCENARIO_DIR = resolve(ROOT, "evaluation", "scenarios");
/** Library files on disk; uploads are limited separately (the hosting body limit). */
export const MAX_LIBRARY_FILE_BYTES = 50 * 1024 * 1024;

const ScenarioId = z.string().regex(/^S\d{3}$/);

const LibraryFile = z.object({
  version: z.literal(1),
  items: z.array(
    z.object({
      scenarioId: ScenarioId,
      audioSource: z.enum(["CALLER_ONLY", "MIXED"]).default("MIXED"),
      firstSpeaker: z.enum(["OPERATOR", "CALLER"]).default("OPERATOR"),
    }),
  ),
});

const ScenarioFile = z.object({
  id: ScenarioId,
  language: z.string(),
  channel: z.string(),
  summary: z.string(),
  messages: z.array(z.union([z.string(), z.object({ sender: z.enum(["VICTIM", "OPERATOR"]), text: z.string() })])),
  expected: z.object({
    band: z.string(),
    indicators: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
    overrides: z.array(z.string()).optional(),
  }),
});

export interface ScriptTurn {
  speaker: "OPERATOR" | "CALLER";
  text: string;
}

export interface DemoScenario {
  id: string;
  title: string;
  /** The scenario's own language tag (e.g. hi-Latn) and the module language it is sent as */
  languageTag: string;
  language: VictimLang;
  audioSource: "CALLER_ONLY" | "MIXED";
  firstSpeaker: "OPERATOR" | "CALLER";
  script: ScriptTurn[];
  /** Test metadata: never sent to the module; shown apart, labelled "expected" */
  expected: { band: string; indicators: string[]; recommendations: string[]; overrides?: string[] };
  recordingAvailable: boolean;
}

export function recordingPath(id: string): string {
  if (!ScenarioId.safeParse(id).success) throw new Error("bad scenario id");
  return resolve(LIBRARY_DIR, "audio", `${id}.wav`);
}

function hasRecording(id: string): boolean {
  const p = recordingPath(id);
  return existsSync(p) && statSync(p).size > 44;
}

/** The scenario's conversation as a script: plain strings are the caller's words. */
export function scriptOf(messages: z.infer<typeof ScenarioFile>["messages"]): ScriptTurn[] {
  return messages.map((m) => (typeof m === "string" ? { speaker: "CALLER", text: m } : { speaker: m.sender === "OPERATOR" ? "OPERATOR" : "CALLER", text: m.text }));
}

export function loadLibrary(): DemoScenario[] {
  const file = resolve(LIBRARY_DIR, "library.json");
  if (!existsSync(file)) return [];
  const lib = LibraryFile.parse(JSON.parse(readFileSync(file, "utf8")));
  return lib.items.flatMap((item) => {
    const path = resolve(SCENARIO_DIR, `${item.scenarioId}.json`);
    if (!existsSync(path)) return [];
    const s = ScenarioFile.parse(JSON.parse(readFileSync(path, "utf8")));
    return [
      {
        id: s.id,
        title: s.summary,
        languageTag: s.language,
        language: toVictimLang(s.language.split("-")[0]),
        audioSource: item.audioSource,
        firstSpeaker: item.firstSpeaker,
        script: scriptOf(s.messages),
        expected: s.expected,
        recordingAvailable: hasRecording(s.id),
      },
    ];
  });
}

export function findScenario(id: string): DemoScenario | null {
  return loadLibrary().find((s) => s.id === id) ?? null;
}
