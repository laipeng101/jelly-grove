import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceGame,
  commitMatch,
  reconcileGame,
  COMBO_WINDOW,
} from "../src/game.ts";
import {
  LEVELS,
  generateBoard,
  findPairs,
  remaining,
  seedRandom,
} from "../src/engine.ts";
import type { Game, Mode } from "../src/storage.ts";

function game(mode: Mode = "journey"): Game {
  const board = generateBoard(LEVELS[0], seedRandom(40));
  return {
    mode,
    level: 1,
    difficulty: 0,
    board,
    seed: 40,
    score: 0,
    cleared: 0,
    total: remaining(board),
    combo: 0,
    bestCombo: 0,
    juice: 0,
    fever: 0,
    lastMatch: 0,
    assists: 0,
    elapsed: 0,
    timeLeft: 120000,
    round: 1,
    phase: "playing",
    history: [],
  };
}
function lastPair(mode: Mode = "journey") {
  const g = game(mode);
  g.board = g.board.map((row) => row.map(() => 0));
  g.board[3][0] = g.board[3][3] = 1;
  g.cleared = g.total - 1;
  return g;
}
test("a final match immediately commits the win with no animation dependency", () => {
  const g = lastPair();
  const out = commitMatch(g, findPairs(g.board, 1)[0], LEVELS[0]);
  assert.equal(out.clearedBoard, true);
  assert.equal(g.phase, "won");
  assert.equal(remaining(g.board), 0);
  assert.equal(g.history.length, 0);
  // A mode switch/serialization at this exact instruction already sees a final state.
  const restored = JSON.parse(JSON.stringify(g));
  reconcileGame(restored, LEVELS[0]);
  assert.equal(restored.phase, "won");
  assert.equal(restored.score, g.score);
});
test("sprint last-millisecond clear earns its bonus before the presentation or clock expires", () => {
  const g = lastPair("sprint");
  g.timeLeft = 150;
  g.score = 2000;
  const out = commitMatch(
    g,
    findPairs(g.board, 1)[0],
    LEVELS[0],
    seedRandom(7),
  );
  assert.equal(out.points, 100);
  assert.equal(g.score, 2600);
  assert.equal(g.round, 2);
  assert.ok(remaining(g.board) > 0);
  assert.equal(advanceGame(g, 260), true);
  assert.equal(g.phase, "lost");
  assert.equal(g.score, 2600);
});
test("sprint deadline is checked at input time and cannot accept a late match", () => {
  const g = game("sprint");
  g.timeLeft = 50;
  const pair = findPairs(g.board, 1)[0];
  advanceGame(g, 51);
  assert.throws(() => commitMatch(g, pair, LEVELS[0]));
  assert.equal(g.score, 0);
  assert.equal(g.elapsed, 50);
});
test("legacy empty playing sessions reconcile once and remain idempotent", () => {
  const journey = lastPair();
  journey.board[3][0] = journey.board[3][3] = 0;
  journey.cleared = journey.total;
  reconcileGame(journey, LEVELS[0]);
  assert.equal(journey.phase, "won");
  const sprint = lastPair("sprint");
  sprint.board[3][0] = sprint.board[3][3] = 0;
  sprint.cleared = sprint.total;
  reconcileGame(sprint, LEVELS[0], seedRandom(12));
  const score = sprint.score;
  reconcileGame(sprint, LEVELS[0]);
  assert.equal(sprint.score, score);
  assert.equal(sprint.round, 2);
});
test("combo window and fever use elapsed game time, and a clear does not award twice", () => {
  const g = game();
  commitMatch(g, findPairs(g.board, 1)[0], LEVELS[0]);
  advanceGame(g, COMBO_WINDOW - 1);
  commitMatch(g, findPairs(g.board, 1)[0], LEVELS[0]);
  assert.equal(g.combo, 2);
  advanceGame(g, COMBO_WINDOW + 1);
  commitMatch(g, findPairs(g.board, 1)[0], LEVELS[0]);
  assert.equal(g.combo, 1);
  while (g.phase === "playing")
    commitMatch(g, findPairs(g.board, 1)[0], LEVELS[0]);
  const score = g.score;
  reconcileGame(g, LEVELS[0]);
  assert.equal(g.score, score);
});

test("completion retains the final match combo for feedback despite resetting gameplay", () => {
  for (const mode of ["journey", "sprint"] as const) {
    const g = lastPair(mode);
    g.combo = 7;
    g.bestCombo = 7;
    g.fever = 5000;
    const out = commitMatch(g, findPairs(g.board, 1)[0], LEVELS[0]);
    assert.equal(out.combo, 8);
    assert.equal(out.fever, true);
    assert.equal(out.clearedBoard, true);
    assert.equal(g.combo, 0);
  }
});
