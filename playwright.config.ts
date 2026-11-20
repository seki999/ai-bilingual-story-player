import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5186",
    channel: process.env.STORY_BROWSER_CHANNEL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5186",
    reuseExistingServer: !process.env.CI,
  },
});
