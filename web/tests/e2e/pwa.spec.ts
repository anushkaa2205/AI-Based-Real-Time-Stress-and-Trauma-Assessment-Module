/**
 * PWA shell (task 9.7, AC-CH-06). Production build only (the service worker is not registered
 * in development). The install itself on Android Chrome still needs a person with a phone.
 */
import { expect, test } from "@playwright/test";
import { freshIp } from "./helpers";

test.skip(!process.env.E2E_BASE_URL, "service worker runs on production builds only (set E2E_BASE_URL)");

test("installable shell; the service worker never stores pages or API responses", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await page.goto("/portal/en");
  const manifest = await page.request.get("/manifest.webmanifest").then((r) => r.json());
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));

  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, { timeout: 30_000 });
  await page.reload(); // now controlled by the worker
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/portal\/en\/consent/);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/portal\/en\/chat/);
  await expect(page.getByTestId("prompt")).toBeVisible();

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  for (const u of cached) expect(u, u).toMatch(/^\/(_next\/static\/|icons\/|offline\.html$)/);
});
