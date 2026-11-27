export const BATCH_GENERATION_BUDGET_MS = 2800;
export const BENCHMARK_ACCEPTANCE_TARGET = 0.9;

export function benchmarkRequestCount() {
  const count = Number(process.env.JOURNEY_BENCH_COUNT ?? 100);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("JOURNEY_BENCH_COUNT must be a positive integer");
  return count;
}
