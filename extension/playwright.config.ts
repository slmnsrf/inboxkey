import { defineConfig, devices } from "@playwright/test"
import path from "path"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/*.test.ts"],
  fullyParallel: false, // Run tests sequentially for extension tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for extension tests (can't load same extension multiple times)
  reporter: process.env.CI ? "github" : "html",
  timeout: 60000, // 60s timeout for extension tests
  expect: {
    timeout: 10000, // 10s for expect assertions
  },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15000, // 15s for actions like click, fill, etc.
  },
  projects: [
    {
      name: "extension-tests",
      use: {
        ...devices["Desktop Chrome"],
        // Extension-specific configuration
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          headless: false, // Extensions require headed mode
          args: [
            `--disable-extensions-except=${path.join(__dirname, "build/chrome-mv3-prod")}`,
            `--load-extension=${path.join(__dirname, "build/chrome-mv3-prod")}`,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
          ],
        },
      },
    },
  ],
})
