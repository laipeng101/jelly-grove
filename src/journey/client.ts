import JourneyWorker from "./worker?worker&inline";
import { selectBackup } from "./backups";
import { validatePuzzle } from "./rules";
import {
  GENERATION_TIMEOUT_MS,
  RECENT_PUZZLE_LIMIT,
  WORKER_GENERATION_BUDGET_MS,
  type Puzzle,
  type ThemeId,
} from "./types";

export async function requestPuzzle(
  themeId: ThemeId,
  recent: string[],
  signal?: AbortSignal,
): Promise<Puzzle> {
  if (signal?.aborted) throw new DOMException("已取消生成", "AbortError");
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined,
      settled = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      worker?.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const finish = (puzzle: Puzzle) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(puzzle);
    };
    const fallback = () => {
      if (settled) return;
      try {
        finish(selectBackup(themeId, recent));
      } catch (error) {
        settled = true;
        cleanup();
        reject(error);
      }
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("已取消生成", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(fallback, GENERATION_TIMEOUT_MS);
    try {
      worker = new JourneyWorker();
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (
          data.status === "generated" &&
          data.puzzle?.themeId === themeId &&
          validatePuzzle(data.puzzle) &&
          !recent.slice(0, RECENT_PUZZLE_LIMIT).includes(data.puzzle.id)
        )
          finish(data.puzzle);
        else fallback();
      };
      worker.onerror = fallback;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      worker.postMessage({ themeId, seed, budgetMs: WORKER_GENERATION_BUDGET_MS });
    } catch {
      fallback();
    }
  });
}
