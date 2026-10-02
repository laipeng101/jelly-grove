import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { generatePuzzle, fingerprint } from "../src/journey/generator";
import { replay } from "../src/journey/solver";
import { challengeMet } from "../src/journey/rules";
import type { ThemeId } from "../src/journey/types";
const count = Number(process.env.JOURNEY_BENCH_COUNT || 100),
  base = Number(process.env.JOURNEY_BENCH_SEED || 980000);
const themes = [];
let failed = false;
for (const themeId of [13, 14, 15, 16, 17, 18] as ThemeId[]) {
  const runs = [],
    distinct = new Set<string>();
  for (let i = 0; i < count; i++) {
    const seed = (base + themeId * 1000 + i) >>> 0,
      result = generatePuzzle(themeId, seed, 2800);
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
    const p = result.puzzle,
      a = replay(p, p.proof.challenge),
      b = replay(p, p.proof.ordinary);
    if (
      !a ||
      !b ||
      !challengeMet(p, a) ||
      b.phase !== "won" ||
      challengeMet(p, b)
    )
      throw new Error(`Proof mismatch ${p.id}`);
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
      (r) => r.status === "generated" && r.elapsedMs < 3000,
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
  if (metrics.acceptance < 0.9) failed = true;
  themes.push(metrics);
  console.log(JSON.stringify({ ...metrics, runs: undefined }));
}
mkdirSync("output/journey", { recursive: true });
writeFileSync(
  "output/journey/generation-benchmark.json",
  JSON.stringify(
    { generatorVersion: 1, baseSeed: base, clock: "performance.now", themes },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
