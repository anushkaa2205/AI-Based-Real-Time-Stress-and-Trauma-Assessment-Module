/**
 * Validates the simulator case library (task S.2, AC-SIM-02): `npm run sim:validate`.
 * Fails on any schema or library error. Lists, without failing, the work the team still
 * owes: second-person reviews and recordings that are still placeholders.
 */
import { checkLibrary } from "@/core/simulator/cases";
import { loadSimCases, SIM_DIR } from "@/core/simulator/load";

const { cases, errors: loadErrors } = loadSimCases(SIM_DIR);
const { errors, pending } = checkLibrary(cases);
const all = [...loadErrors, ...errors];

console.log(`Simulator cases in ${SIM_DIR}: ${cases.length} loaded`);
for (const c of cases) {
  const expected = "band" in c.expected ? c.expected.band : "different readings";
  console.log(`  ${c.id}  ${c.channel.padEnd(10)} ${c.language.padEnd(7)} expected ${expected.padEnd(18)} ${c.title}`);
}
if (pending.length) {
  console.log(`\nStill to do by the team (${pending.length}):`);
  for (const p of pending) console.log(`  - ${p}`);
}
if (all.length) {
  console.error(`\n${all.length} problem(s):`);
  for (const e of all) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nAll cases valid.");
