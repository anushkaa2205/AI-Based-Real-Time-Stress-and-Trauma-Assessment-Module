/**
 * `npm run jobs` (task 5.7): runs due jobs every 5 seconds, locally. In the
 * deployed app jobs run inside requests instead (ARCHITECTURE §10.2).
 * Stop with Ctrl+C.
 */
import "./load-env";
import { runDue } from "@/core/jobs/runDue";

const INTERVAL_MS = 5_000;

async function loop() {
  for (;;) {
    try {
      const r = await runDue();
      if (r.ran || r.failed) console.log(`${new Date().toISOString()} jobs ran: ${r.ran}, retrying later: ${r.failed}`);
    } catch (err) {
      console.error(`jobs loop error: ${(err as Error)?.name ?? "Error"}`);
    }
    await new Promise((res) => setTimeout(res, INTERVAL_MS));
  }
}

console.log("Job loop started (Ctrl+C to stop)");
void loop();
