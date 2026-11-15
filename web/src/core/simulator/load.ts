/**
 * Reads the simulator case library from evaluation/simulator/ (task S.2). Server-only.
 * Every file must parse against SimCaseSchema and be named after its id; recorded or
 * text-to-speech audio must exist on disk (placeholders may be missing until recorded).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SimCaseSchema, type SimCase } from "@/contracts/simulator";

/** evaluation/simulator, from web/ (the app's working directory) */
export const SIM_DIR = resolve(process.cwd(), "..", "evaluation", "simulator");

export interface LoadResult {
  cases: SimCase[];
  errors: string[];
}

export function loadSimCases(dir: string = SIM_DIR): LoadResult {
  const cases: SimCase[] = [];
  const errors: string[] = [];
  const files = readdirSync(dir).filter((f) => /^C\d{2}\.json$/.test(f)).sort();
  for (const f of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      errors.push(`${f}: not valid JSON (${(e as Error).message})`);
      continue;
    }
    const parsed = SimCaseSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${f}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      continue;
    }
    const c = parsed.data;
    if (`${c.id}.json` !== f) errors.push(`${f}: file name must be ${c.id}.json`);
    for (const s of c.steps)
      if (s.kind === "speech" && s.audio.source !== "PLACEHOLDER" && !existsSync(join(dir, s.audio.file)))
        errors.push(`${f}: ${s.audio.source} audio ${s.audio.file} is missing`);
    cases.push(c);
  }
  return { cases, errors };
}
