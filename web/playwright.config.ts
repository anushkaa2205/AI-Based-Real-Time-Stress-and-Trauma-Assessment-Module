import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the dev server and the database in .env.local.
 * They use the installed Microsoft Edge (`channel: "msedge"`), so no browser
 * download is needed. Synthetic data only (CLAUDE.md rule 11).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", channel: "msedge" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "msedge" } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
