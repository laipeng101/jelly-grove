import StatusWorker from "./challenge-worker?worker&inline";
import { quickChallengeStatus, type ChallengeStatus } from "./challenge-status";
import { stateKey } from "./solver";
import type { Puzzle, JourneyState } from "./types";
export { quickChallengeStatus, type ChallengeStatus } from "./challenge-status";
export class ChallengeMonitor {
  private worker: Worker | null = null;
  private timer = 0;
  private version = 0;
  private cache = new Map<string, ChallengeStatus>();
  cancel() { this.version++; clearTimeout(this.timer); this.worker?.terminate(); this.worker = null; }
  check(puzzle: Puzzle, state: JourneyState, callback: (status: ChallengeStatus) => void) {
    this.cancel();
    const quick = quickChallengeStatus(puzzle, state);
    if (quick.status !== "unknown") { callback(quick); return; }
    const key = JSON.stringify([puzzle, stateKey(state)]);
    const cached = this.cache.get(key);
    if (cached) { callback(cached); return; }
    const version = this.version;
    const finish = (value: ChallengeStatus) => {
      if (version !== this.version) return;
      this.cancel();
      if (value.status !== "unknown") {
        this.cache.set(key, value);
        if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value!);
      }
      callback(value);
    };
    try {
      this.worker = new StatusWorker();
      this.timer = window.setTimeout(() => finish({ status: "unknown", reason: "挑战机会尚未确定" }), 1500);
      this.worker.onmessage = event => {
        const value = event.data;
        finish(value && ["possible", "failed", "unknown", "achieved"].includes(value.status) && typeof value.reason === "string" ? value : { status: "unknown", reason: "挑战机会尚未确定" });
      };
      this.worker.onerror = () => finish({ status: "unknown", reason: "挑战机会尚未确定" });
      this.worker.postMessage({ puzzle, state: structuredClone(state) });
    } catch { finish({ status: "unknown", reason: "挑战机会尚未确定" }); }
  }
}
