/** IVRS simulation (task 7.8, FR-CH-05, AC-CH-03): keypad input only. Synthetic answers. */
import { expect, test } from "@playwright/test";
import { freshIp, withDb } from "./helpers";

test("the safety check and PHQ-2 / GAD-2 complete with keypad input only (AC-CH-03)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await page.goto("/portal/en/ivrs");
  const ivrs = page.getByTestId("ivrs");
  await expect(ivrs).toHaveAttribute("data-step", "language");
  await expect(ivrs).toHaveAttribute("data-ready", "true"); // hydrated, keys listened to

  const key = async (k: string, expectStep: string) => {
    await page.keyboard.press(k);
    await expect(ivrs).toHaveAttribute("data-step", expectStep);
  };
  await key("1", "consent"); // English
  await key("1", "SAFETY_SAFE_NOW"); // may use my answers
  await key("1", "SAFETY_ACCUSED_NEARBY"); // safe: yes
  await key("2", "SAFETY_SUICIDAL_THOUGHTS"); // accused nearby: no
  await key("2", "PHQ2_1"); // suicidal thoughts: no
  await page.keyboard.press("7"); // not an option
  await expect(page.getByText("That key is not an option")).toBeVisible();
  await key("1", "PHQ2_2");
  await key("0", "GAD2_1");
  await page.getByTestId("key-2").click(); // on-screen keypad works too
  await expect(ivrs).toHaveAttribute("data-step", "GAD2_2");
  await key("*", "done"); // skip

  const docket = (await page.getByTestId("docket").textContent())!.trim();
  expect(docket).toMatch(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/);

  await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: docket });
    const i = await db.collection("interactions").findOne({ caseId: c!._id });
    expect(i!.channel).toBe("IVRS");
    const answers = Object.fromEntries((i!.screenerResponses as { itemCode: string; value: number | null; skipped?: boolean }[]).map((r) => [r.itemCode, r.skipped ? "skip" : r.value]));
    expect(answers).toEqual({
      SAFETY_SAFE_NOW: 1,
      SAFETY_ACCUSED_NEARBY: 0,
      SAFETY_SUICIDAL_THOUGHTS: 0,
      PHQ2_1: 1,
      PHQ2_2: 0,
      GAD2_1: 2,
      GAD2_2: "skip",
    });
    expect(i!.status).toBe("ENDED");
  });
});
