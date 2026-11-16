/** Five languages (task 8.1, FR-LANG-01, FR-REC-06, AC-LANG-01, AC-REC-04, rule 4). Synthetic text only. */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dropIntegrationKeys, integrationSession, type Lang } from "./helpers";

const msg = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, `../../messages/${lang}.json`), "utf8"));

test.afterAll(dropIntegrationKeys);

test("the emergency options come back in the interaction's own language (FR-REC-06, AC-REC-04)", async ({ request }) => {
  for (const lang of ["en", "hi", "mr", "ta", "bn"] as Lang[]) {
    const v = await integrationSession(request, { lang });
    // "Accused nearby" from NHAA's own case record (metadata, OV-2) → Critical.
    const r = await v.call("/context", { accusedNearby: true }, "put");
    expect(r.status(), lang).toBe(200);
    const body = await r.json();
    expect(body.showEmergencyPanel, lang).toBe(true);
    expect(body.emergency.message, lang).toBe(msg(lang).emergency.message);
    expect(body.emergency.numbers.map((n: { number: string }) => n.number), lang).toEqual(["112", "14416", "14566"]);
    expect(JSON.stringify(body), lang).not.toMatch(/svi|band|CRITICAL|INTIMIDATION/i); // rule 1
  }
});

test("a Tamil safety message raises the emergency options, in Tamil (rule 4, FR-LANG-02)", async ({ request }) => {
  const v = await integrationSession(request, { lang: "ta", consent: { shareWithCounsellor: false } });
  const r = await v.say("அவர்கள் இப்போது இங்கே இருக்கிறார்கள்");
  expect(r.status()).toBe(201);
  const body = await r.json();
  expect(body.showEmergencyPanel).toBe(true);
  expect(body.emergency.message).toBe(msg("ta").emergency.message);
  expect(JSON.stringify(body)).not.toMatch(/svi|band|CRITICAL|INTIMIDATION/i); // rule 1
});
