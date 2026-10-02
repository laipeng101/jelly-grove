import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const count = Number(process.env.JOURNEY_BENCH_COUNT || 100);
const url = process.env.JOURNEY_URL || "http://127.0.0.1:4180/?play=lab";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// Observe real Worker responses without exposing a testing API in the product.
await page.addInitScript(() => {
  const NativeWorker = window.Worker;
  window.__journeyWorkers = [];
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      const started = performance.now();
      super(...args);
      this.addEventListener("message", (event) => {
        window.__journeyWorkers.push({
          status: event.data.status,
          id: event.data.puzzle?.id,
          elapsedMs: performance.now() - started,
        });
      });
    }
  };
});
const key = "jelly-grove.journey-trial.v1";
const current = () =>
  page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved?.session) return null;
    const p = saved.session.puzzle;
    const worker = window.__journeyWorkers.findLast((w) => w.id === p.id);
    return {
      id: p.id,
      themeId: p.themeId,
      seed: p.seed,
      source: worker ? "generated" : "backup",
      workerMs: worker?.elapsedMs ?? null,
    };
  }, key);
const themes = [];
try {
  await page.goto(url);
  await page.locator("#trial-board").waitFor();
  for (const themeId of [13, 14, 15, 16, 17, 18]) {
    const runs = [];
    for (let i = 0; i < count; i++) {
      const before = await current();
      await page.locator(".trial-theme-button").click();
      const started = performance.now();
      await page.locator(`[data-pick-theme="${themeId}"]`).click();
      await page.waitForFunction(
        ({ key, id, themeId }) => {
          const p = JSON.parse(localStorage.getItem(key) || "null")?.session
            ?.puzzle;
          return p && p.id !== id && p.themeId === themeId;
        },
        { key, id: before?.id, themeId },
        { timeout: 10000, polling: 25 },
      );
      runs.push({
        index: i,
        ...(await current()),
        uiMs: performance.now() - started,
      });
    }
    const generated = runs.filter(
      (r) => r.source === "generated" && r.workerMs < 3000,
    );
    const times = generated.map((r) => r.workerMs).sort((a, b) => a - b);
    const metrics = {
      themeId,
      requests: count,
      generated: generated.length,
      acceptance: generated.length / count,
      unique: new Set(runs.map((r) => r.id)).size,
      p95Ms: times[Math.floor(times.length * 0.95)],
      maxMs: times.at(-1),
      runs,
    };
    themes.push(metrics);
    console.log(JSON.stringify({ ...metrics, runs: undefined }));
  }
  await mkdir("output/journey", { recursive: true });
  const output = {
    browser: browser.version(),
    viewport: { width: 360, height: 640 },
    clock:
      "Real Chromium Worker wall clock, including startup; desktop mobile emulation",
    offlineHash: createHash("sha256")
      .update(await readFile("dist/果冻果园.html"))
      .digest("hex"),
    errors,
    themes,
  };
  await writeFile(
    "output/journey/browser-generation-benchmark.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  if (
    errors.length ||
    themes.some((t) => t.acceptance < 0.9 || t.unique !== count)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
