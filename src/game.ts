import {
  clone,
  findPairs,
  generateBoard,
  remaining,
  removePair,
  reshuffle,
  type Level,
  type Pair,
} from "./engine";
import type { Game, Snapshot } from "./storage";

export const COMBO_WINDOW = 5500;
export type Outcome = {
  points: number;
  clearedBoard: boolean;
  startedFever: boolean;
  autoShuffled: boolean;
};

export function gameSnapshot(g: Game): Snapshot {
  return {
    board: clone(g.board),
    score: g.score,
    cleared: g.cleared,
    combo: g.combo,
    bestCombo: g.bestCombo,
    juice: g.juice,
    fever: g.fever,
    lastMatch: g.lastMatch,
  };
}
export function rememberMove(g: Game) {
  g.history.push(gameSnapshot(g));
  if (g.history.length > 20) g.history.shift();
}

function settleBoard(g: Game, level: Level, rng: () => number) {
  if (g.phase !== "playing" || remaining(g.board) !== 0) return false;
  g.history = [];
  if (g.mode === "sprint") {
    g.score += 500;
    g.round++;
    g.board = generateBoard(level, rng);
    g.total += remaining(g.board);
  } else {
    g.phase = "won";
    g.fever = 0;
  }
  g.combo = 0;
  return true;
}
export function repairBoard(g: Game, rng = Math.random) {
  if (
    g.phase !== "playing" ||
    !remaining(g.board) ||
    findPairs(g.board, 1).length
  )
    return false;
  g.board = reshuffle(g.board, rng);
  g.history = [];
  return true;
}

/** A successful input is one transaction. Animation never owns scoring, a new
 * round, the winning phase, or dead-board recovery. */
export function commitMatch(
  g: Game,
  pair: Pick<Pair, "a" | "b">,
  level: Level,
  rng = Math.random,
): Outcome {
  if (g.phase !== "playing" || (g.mode === "sprint" && g.timeLeft <= 0))
    throw new Error("Game is not accepting matches");
  const next = removePair(g.board, pair, level.gravity);
  rememberMove(g);
  g.combo =
    g.cleared > 0 && g.elapsed - g.lastMatch <= COMBO_WINDOW ? g.combo + 1 : 1;
  g.bestCombo = Math.max(g.bestCombo, g.combo);
  g.lastMatch = g.elapsed;
  const points = (100 + Math.min(g.combo - 1, 9) * 25) * (g.fever > 0 ? 2 : 1);
  g.score += points;
  g.cleared++;
  let startedFever = false;
  if (g.fever <= 0) {
    g.juice = Math.min(100, g.juice + 12 + Math.min(g.combo - 1, 4) * 2);
    if (g.juice >= 100) {
      g.juice = 0;
      g.fever = 10000;
      startedFever = true;
    }
  }
  g.board = next;
  const clearedBoard = settleBoard(g, level, rng);
  return {
    points,
    clearedBoard,
    startedFever,
    autoShuffled: repairBoard(g, rng),
  };
}

/** Normalize legacy v1 saves made between a logical clear and its animation. */
export function reconcileGame(g: Game, level: Level, rng = Math.random) {
  const clearedBoard = settleBoard(g, level, rng);
  let expired = false;
  if (g.mode === "sprint" && g.phase === "playing" && g.timeLeft <= 0) {
    g.timeLeft = 0;
    g.phase = "lost";
    g.combo = 0;
    g.fever = 0;
    expired = true;
  }
  return { clearedBoard, expired, autoShuffled: repairBoard(g, rng) };
}

/** Returns true exactly when this advance reaches the sprint deadline. */
export function advanceGame(g: Game, milliseconds: number) {
  if (g.phase !== "playing") return false;
  const dt = Math.max(
    0,
    g.mode === "sprint" ? Math.min(milliseconds, g.timeLeft) : milliseconds,
  );
  g.elapsed += dt;
  g.fever = Math.max(0, g.fever - dt);
  if (g.elapsed - g.lastMatch > COMBO_WINDOW) g.combo = 0;
  if (g.mode === "sprint") {
    g.timeLeft = Math.max(0, g.timeLeft - dt);
    if (g.timeLeft === 0) {
      g.phase = "lost";
      g.fever = 0;
      g.combo = 0;
      return true;
    }
  }
  return false;
}
