import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { generatePuzzle, fingerprint } from "../src/journey/generator";
import { THEMES } from "../src/journey/themes";
import { GENERATION_TIMEOUT_MS, GENERATOR_VERSION } from "../src/journey/types";
import {
  BATCH_GENERATION_BUDGET_MS,
  BENCHMARK_ACCEPTANCE_TARGET,
  benchmarkRequestCount,
} from "./journey-generation";

const count = benchmarkRequestCount();
const base = Number(process.env.JOURNEY_BENCH_SEED || 980000);
const themes = [];
let failed = false;
for (const { id: themeId } of THEMES) {
  const runs = [],
    distinct = new Set<string>();
  for (let i = 0; i < count; i++) {
    const seed = (base + themeId * 1000 + i) >>> 0,
      result = generatePuzzle(themeId, seed, BATCH_GENERATION_BUDGET_MS);
    if (result.status === "unknown") {
      runs.push({
        seed,
        status: "unknown",
        elapsedMs: result.elapsedMs,
        attempts: result.attempts,
        nodes: result.nodes,
      });
      continue;
    }
    const p = result.puzzle;
    const signature = createHash("sha256").update(fingerprint(p)).digest("hex");
    distinct.add(signature);
    runs.push({
      seed,
      puzzleId: p.id,
      status: "generated",
      elapsedMs: result.elapsedMs,
      attempts: result.attempts,
      nodes: result.nodes,
      challengeMoves: p.proof.challenge.length,
      criticalBranches: p.proof.critical.length,
      minimumFuel: p.proof.minimumFuel,
      signature,
    });
  }
  const accepted = runs.filter(
      (r) => r.status === "generated" && r.elapsedMs < GENERATION_TIMEOUT_MS,
    ),
    times = accepted.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const metrics = {
    themeId,
    requests: count,
    generated: accepted.length,
    acceptance: accepted.length / count,
    distinct: distinct.size,
    p50Ms: times[Math.floor(times.length * 0.5)],
    p95Ms: times[Math.floor(times.length * 0.95)],
    maxMs: times.at(-1),
    runs,
  };
  if (metrics.acceptance < BENCHMARK_ACCEPTANCE_TARGET) failed = true;
  themes.push(metrics);
  console.log(JSON.stringify({ ...metrics, runs: undefined }));
}
mkdirSync("output/journey", { recursive: true });
writeFileSync(
  "output/journey/generation-benchmark.json",
  JSON.stringify(
    {
      generatorVersion: GENERATOR_VERSION,
      baseSeed: base,
      clock: "performance.now",
      themes,
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
