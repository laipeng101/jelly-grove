import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { THEMES } from "../src/journey/themes.ts";
import {
  GENERATION_TIMEOUT_MS,
  RECENT_PUZZLE_LIMIT,
} from "../src/journey/types.ts";
import {
  BENCHMARK_ACCEPTANCE_TARGET,
  benchmarkRequestCount,
} from "./journey-generation.ts";

const count = benchmarkRequestCount();
const file = pathToFileURL(resolve("dist/果冻果园.html"));
const offlineHash = createHash("sha256").update(await readFile(file)).digest("hex");
file.searchParams.set("play", "lab");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
  offline: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
// Observe real Worker responses without exposing a testing API in the product.
await page.addInitScript(() => {
  const NativeWorker = window.Worker;
  const observed = { workerCount: 0, generated: [] };
  window.__journeyBenchmark = observed;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      const started = performance.now();
      super(...args);
      const number = ++observed.workerCount;
      this.addEventListener("message", (event) => {
        if (event.data.status === "generated") {
          observed.generated.push({
            number,
            id: event.data.puzzle.id,
            elapsedMs: performance.now() - started,
          });
        }
      });
    }
  };
});
const key = "jelly-grove.journey-trial.v1";
const themes = [];
try {
  await page.goto(file.href);
  await page.locator("#trial-board").waitFor();
  for (const { id: themeId } of THEMES) {
    const runs = [];
    for (let i = 0; i < count; i++) {
      await page.locator(".trial-theme-button").click();
      const before = await page.evaluate(
        ({ key, recentLimit }) => ({
          workerCount: window.__journeyBenchmark.workerCount,
          recent: JSON.parse(localStorage.getItem(key)).recent.slice(
            0,
            recentLimit,
          ),
        }),
        { key, recentLimit: RECENT_PUZZLE_LIMIT },
      );
      const started = performance.now();
      await page.locator(`[data-pick-theme="${themeId}"]`).click();
      await page.waitForFunction(
        ({ key, themeId }) => {
          const p = JSON.parse(localStorage.getItem(key) || "null")?.session
            ?.puzzle;
          const preview = document.querySelector('[data-trial="preview"]');
          return p?.themeId === themeId && preview?.disabled === false;
        },
        { key, themeId },
        { timeout: 10000, polling: 25 },
      );
      const current = await page.evaluate(
        ({ key, previousWorkers }) => {
          const { id, themeId, seed } = JSON.parse(localStorage.getItem(key))
            .session.puzzle;
          const worker = window.__journeyBenchmark.generated.findLast(
            (w) => w.number > previousWorkers && w.id === id,
          );
          return {
            id,
            themeId,
            seed,
            source: worker ? "generated" : "backup",
            workerMs: worker?.elapsedMs ?? null,
          };
        },
        { key, previousWorkers: before.workerCount },
      );
      runs.push({
        index: i,
        ...current,
        uiMs: performance.now() - started,
        repeatedRecent: before.recent.includes(current.id),
      });
    }
    const generated = runs.filter(
      (r) => r.source === "generated" && r.workerMs < GENERATION_TIMEOUT_MS,
    );
    const times = generated.map((r) => r.workerMs).sort((a, b) => a - b);
    const metrics = {
      themeId,
      requests: count,
      generated: generated.length,
      acceptance: generated.length / count,
      unique: new Set(runs.map((r) => r.id)).size,
      recentRepeats: runs.filter((r) => r.repeatedRecent).length,
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
    offlineHash,
    errors,
    themes,
  };
  await writeFile(
    "output/journey/browser-generation-benchmark.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  if (
    errors.length ||
    themes.some(
      (t) => t.acceptance < BENCHMARK_ACCEPTANCE_TARGET || t.recentRepeats > 0,
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
