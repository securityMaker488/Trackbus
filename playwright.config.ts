import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    trace: "retain-on-failure",
  },
  outputDir: "work/e2e-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "work/playwright-report", open: "never" }],
  ],
});
