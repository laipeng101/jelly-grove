import {
  attemptMatch,
  challengeMet,
  initialState,
  validatePuzzle,
} from "./rules";
import type { JourneySession, MatchResult, Move, Puzzle } from "./types";

export function createSession(puzzle: Puzzle, hintLevel = 0): JourneySession {
  if (!validatePuzzle(puzzle))
    throw new Error("新关卡内容不完整或版本不兼容，无法开始本盘。");
  if (!Number.isInteger(hintLevel) || hintLevel < 0 || hintLevel > 3)
    throw new Error("提示状态无效。");
  return {
    puzzle: structuredClone(puzzle),
    state: initialState(puzzle),
    history: [],
    actions: [],
    hintLevel,
  };
}

export function playMove(session: JourneySession, move: Move): MatchResult {
  const result = attemptMatch(session.puzzle, session.state, move);
  if (result.ok) {
    session.history.push(structuredClone(session.state));
    session.actions.push(structuredClone(move));
    session.state = result.state;
  }
  return result;
}

export function undoMove(session: JourneySession): boolean {
  const previous = session.history.pop();
  if (!previous) return false;
  session.state = previous;
  session.actions.pop();
  return true;
}

export function retrySession(session: JourneySession): JourneySession {
  return createSession(session.puzzle, session.hintLevel);
}

export function earnedStars(session: JourneySession): number {
  return session.state.phase === "won"
    ? 1 +
        Number(session.hintLevel === 0) +
        Number(challengeMet(session.puzzle, session.state))
    : 0;
}
