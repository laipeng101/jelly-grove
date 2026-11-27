import type { Page } from "@playwright/test";

export async function pauseBrowserClock(page: Page) {
  const pauseTime = Date.now();
  // Leave enough simulated time for Playwright to install the clock and pause it.
  await page.clock.install({ time: pauseTime - 60_000 });
  await page.clock.pauseAt(pauseTime);
}
