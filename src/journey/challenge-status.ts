import { challengeMet } from "./rules";
import { solve } from "./solver";
import type { JourneyState, Puzzle } from "./types";
export type ChallengeStatus = { status: "possible" | "failed" | "unknown" | "achieved"; reason: string };
export function quickChallengeStatus(puzzle: Puzzle, state: JourneyState): ChallengeStatus {
  if (state.phase === "won") return challengeMet(puzzle, state) ? { status: "achieved", reason: "专属挑战已完成" } : { status: "failed", reason: "本次通关未满足专属挑战" };
  if (state.phase === "lost") return { status: "failed", reason: "本盘暂时无法继续，可撤销恢复机会" };
  const c = puzzle.challenge;
  if (c.kind === "first-window" && c.fruits.some(f => state.missedFirst.includes(f))) return { status: "failed", reason: "已错过目标首次到站的送达窗口" };
  if (c.kind === "preserve" && state.board.flat().filter(f => f === c.fruit).length < c.pairs * 2) return { status: "failed", reason: "需要保留的普通水果已不足" };
  if (c.kind === "no-outside" && state.outsideTargets > 0) return { status: "failed", reason: "已在采收口外消除目标水果" };
  if (c.kind === "fuel" && state.fuelUsed > c.limit) return { status: "failed", reason: "普通水果消耗已超过本盘最低消耗" };
  return { status: "unknown", reason: "正在检查挑战机会" };
}
export function analyzeChallenge(puzzle: Puzzle, state: JourneyState, budgetMs = 1000, maxNodes = 100000): ChallengeStatus {
  const quick = quickChallengeStatus(puzzle, state);
  if (quick.status !== "unknown") return quick;
  const result = solve(puzzle, { start: state, deadline: performance.now() + budgetMs, maxNodes });
  if (result.status === "unknown") return { status: "unknown", reason: "挑战机会尚未确定" };
  if (result.root.challenge) return { status: "possible", reason: "仍有机会完成专属挑战" };
  return { status: "failed", reason: result.root.win ? "当前局面已无法满足专属挑战，可撤销恢复机会" : "当前局面已无通关路线，可撤销重新思考" };
}
