import JourneyWorker from "./worker?worker&inline";
import { selectBackup } from "./backups";
export { selectBackup } from "./backups";
import { validatePuzzle } from "./rules";
import type { Puzzle, ThemeId } from "./types";

export async function requestPuzzle(
  themeId: ThemeId,
  recent: string[],
  signal?: AbortSignal,
): Promise<{
  puzzle: Puzzle;
  source: "generated" | "backup";
  elapsedMs: number;
}> {
  if (signal?.aborted) throw new DOMException("已取消生成", "AbortError");
  const start = performance.now();
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined,
      settled = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      worker?.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const finish = (puzzle: Puzzle, source: "generated" | "backup") => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ puzzle, source, elapsedMs: performance.now() - start });
    };
    const fallback = () => {
      if (settled) return;
      try {
        finish(selectBackup(themeId, recent), "backup");
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
    timer = setTimeout(fallback, 3000);
    try {
      worker = new JourneyWorker();
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (
          data.status === "generated" &&
          data.puzzle?.themeId === themeId &&
          validatePuzzle(data.puzzle) &&
          !recent.slice(-20).includes(data.puzzle.id)
        )
          finish(data.puzzle, "generated");
        else fallback();
      };
      worker.onerror = fallback;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      worker.postMessage({ themeId, seed, budgetMs: 2750 });
    } catch {
      fallback();
    }
  });
}
