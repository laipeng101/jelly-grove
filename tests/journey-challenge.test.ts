import test from "node:test";
import assert from "node:assert/strict";
import backups from "../src/journey/backups.json";
import { candidate, certify } from "../src/journey/generator";
import { solve } from "../src/journey/solver";
import { initialState } from "../src/journey/rules";
import { createSession, playMove, undoMove, retrySession } from "../src/journey/session";
import { analyzeChallenge, quickChallengeStatus } from "../src/journey/challenge-status";
import type { Puzzle } from "../src/journey/types";
test("hidden challenge loss below fuel limit is detected and undo restores opportunity", () => {
  const puzzle = candidate(18, 1311065588);
  assert.ok(certify(puzzle, solve(puzzle, { deadline: Infinity })));
  const session = createSession(puzzle);
  assert.ok(playMove(session, { a: { r: 3, c: 0 }, b: { r: 3, c: 1 } }).ok);
  assert.ok(playMove(session, { a: { r: 1, c: 1 }, b: { r: 0, c: 1 } }).ok);
  assert.equal(session.state.fuelUsed, 1);
  assert.equal(quickChallengeStatus(puzzle, session.state).status, "unknown");
  assert.equal(analyzeChallenge(puzzle, session.state).status, "failed");
  undoMove(session);
  undoMove(session);
  assert.equal(analyzeChallenge(puzzle, session.state).status, "possible");
  assert.equal(session.hintLevel, 0);
});
test("bounded incomplete analysis cannot call an undecided challenge failed", () => {
  const puzzle = (backups as Puzzle[]).find(p => p.themeId === 18)!;
  assert.equal(analyzeChallenge(puzzle, initialState(puzzle), 1000, 0).status, "unknown");
  assert.equal(analyzeChallenge(puzzle, initialState(puzzle), -1).status, "unknown");
});
test("all direct irreversible challenge violations have reasons independent of hints", () => {
  for (const theme of [13, 14, 16, 18]) {
    const puzzle = (backups as Puzzle[]).find(p => p.themeId === theme)!;
    const state = initialState(puzzle), c = puzzle.challenge;
    if (c.kind === "first-window") state.missedFirst.push(c.fruits[0]);
    if (c.kind === "preserve") state.board = state.board.map(row => row.map(f => f === c.fruit ? 0 : f));
    if (c.kind === "no-outside") state.outsideTargets = 1;
    if (c.kind === "fuel") state.fuelUsed = c.limit + 1;
    const result = quickChallengeStatus(puzzle, state);
    assert.equal(result.status, "failed");
    assert.ok(result.reason.length > 0);
  }
});
test("challenge stars are independent of sticky hint use on completed and retry states", () => {
  for (const puzzle of (backups as Puzzle[]).filter((_, index) => index % 32 === 0)) {
    const session = createSession(puzzle, 1);
    for (const move of puzzle.proof.challenge) assert.ok(playMove(session, move).ok);
    assert.equal(quickChallengeStatus(puzzle, session.state).status, "achieved");
    assert.equal(retrySession(session).hintLevel, 1);
    undoMove(session);
    assert.equal(analyzeChallenge(puzzle, session.state).status, "possible");
  }
});
