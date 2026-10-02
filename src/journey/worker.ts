import { generatePuzzle } from "./generator";
import type { ThemeId } from "./types";
self.onmessage = (
  event: MessageEvent<{ themeId: ThemeId; seed: number; budgetMs: number }>,
) => {
  try {
    self.postMessage(
      generatePuzzle(event.data.themeId, event.data.seed, event.data.budgetMs),
    );
  } catch (error) {
    self.postMessage({
      status: "unknown",
      error: error instanceof Error ? error.message : "generation failed",
    });
  }
};
