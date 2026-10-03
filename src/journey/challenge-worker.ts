import { analyzeChallenge } from "./challenge-status";
import type { Puzzle, JourneyState } from "./types";
self.onmessage = (event: MessageEvent<{ puzzle: Puzzle; state: JourneyState }>) => {
  try { self.postMessage(analyzeChallenge(event.data.puzzle, event.data.state)); }
  catch { self.postMessage({ status: "unknown", reason: "挑战机会尚未确定" }); }
};
