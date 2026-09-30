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
    baseURL: "http://127.0.0.1:4179",
    browserName: "chromium",
    viewport: { width: 390, height: 700 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Test the production build. A dev server watches trace/report HTML under
    // output/ and can otherwise reload a game while another test writes evidence.
    command: "npm run preview -- --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: !process.env.CI,
  },
});
