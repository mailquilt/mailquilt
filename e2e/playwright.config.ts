import { defineConfig, devices } from "@playwright/test";

const APP_URL = process.env.MAILQUILT_URL ?? "http://localhost:3300";

export default defineConfig({
  forbidOnly: true,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: [["list"]],
  retries: 0,
  testDir: ".",
  testMatch: "*.test.ts",
  use: { baseURL: APP_URL, trace: "retain-on-failure" },
  workers: 1,
});
