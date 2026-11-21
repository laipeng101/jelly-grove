import { challengeMet } from "./rules";
import { solve } from "./solver";
import type { JourneyState, Puzzle } from "./types";
export type ChallengeStatus = { status: "possible" | "failed" | "unknown" | "achieved"; reason: string };
export function quickChallengeStatus(puzzle: Puzzle, state: JourneyState): ChallengeStatus {
  if (state.phase === "won") return { status: challengeMet(puzzle, state) ? "achieved" : "failed", reason: "" };
  if (state.phase === "lost") return { status: "failed", reason: "本盘已结束。" };
  const c = puzzle.challenge;
  if (c.kind === "first-window" && c.fruits.some(f => state.missedFirst.includes(f))) return { status: "failed", reason: "有目标水果首次到达采收口时未送达。" };
  if (c.kind === "preserve" && state.board.flat().filter(f => f === c.fruit).length < c.pairs * 2) return { status: "failed", reason: "剩余水果少于挑战要求。" };
  if (c.kind === "no-outside" && state.outsideTargets > 0) return { status: "failed", reason: "已在采收口外消除目标水果。" };
  if (c.kind === "fuel" && state.fuelUsed > c.limit) return { status: "failed", reason: "普通水果消除对数已超出上限。" };
  return { status: "unknown", reason: "正在检查能否完成挑战。" };
}
export function analyzeChallenge(puzzle: Puzzle, state: JourneyState, budgetMs = 1000, maxNodes = 100000): ChallengeStatus {
  const quick = quickChallengeStatus(puzzle, state);
  if (quick.status !== "unknown") return quick;
  const result = solve(puzzle, { start: state, deadline: performance.now() + budgetMs, maxNodes });
  if (result.status === "unknown") return { status: "unknown", reason: "挑战机会尚未确定" };
  if (result.root.challenge) return { status: "possible", reason: "当前棋盘仍可完成挑战。" };
  return { status: "failed", reason: result.root.win ? "当前棋盘只能完成送达目标。" : "当前棋盘已无通关解。" };
}
