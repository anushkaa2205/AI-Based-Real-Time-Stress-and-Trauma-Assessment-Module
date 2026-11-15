/** Five languages (task 8.1, FR-LANG-01, AC-LANG-01, rule 4). Synthetic text only. */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { victimSession } from "./helpers";

const msg = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, `../../messages/${lang}.json`), "utf8"));

test("the start page offers all five languages, each in its own script", async ({ page }) => {
  await page.goto("/portal");
  for (const label of ["English", "हिंदी", "मराठी", "தமிழ்", "বাংলা"]) await expect(page.getByRole("link", { name: label })).toBeVisible();
  for (const lang of ["mr", "ta", "bn"]) {
    await page.goto(`/portal/${lang}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(lang).start.title);
  }
});

test("a Tamil safety message raises the emergency panel, in Tamil (rule 4, FR-LANG-02)", async ({ request }) => {
  const v = await victimSession(request, "ta");
  await v.call("/consent", { noticeVersion: "2026-11-v1", language: "ta", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: false, followUpContact: false });
  await v.call("/screeners", { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 });
  const r = await v.call("/messages", { text: "அவர்கள் இப்போது இங்கே இருக்கிறார்கள்", promptKey: "flow.narrative.open" });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.showEmergencyPanel).toBe(true);
  expect(body.emergency.message).toBe(msg("ta").emergency.message);
  expect(JSON.stringify(body)).not.toMatch(/svi|band|CRITICAL|INTIMIDATION/i); // rule 1
});
