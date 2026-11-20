import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  outputDir: "output/playwright/regression",
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
  ],
  use: {
    browserName: "chromium",
    viewport: { width: 390, height: 700 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Build before previewing. Port 0 lets the OS assign a free loopback port.
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 0",
    wait: {
      // Playwright's baseURL fixture reads this environment variable in each worker.
      stdout: /Local:\s+(?<PLAYWRIGHT_TEST_BASE_URL>http:\/\/127\.0\.0\.1:\d+\/)/,
    },
  },
});
