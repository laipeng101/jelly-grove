import test from "node:test";
import assert from "node:assert/strict";
import { conveyorSteps, TOTAL_MS } from "../src/journey/motion";
import { attemptMatch, initialState } from "../src/journey/rules";
import backups from "../src/journey/backups.json";
import type { Puzzle } from "../src/journey/types";
test("conveyor presentation exactly matches runtime shifts in both directions", () => {
  assert.equal(TOTAL_MS, 500);
  let seenForward = false, seenBackward = false;
  for (const p of backups as Puzzle[]) {
    const state = initialState(p), pair = p.proof.challenge[0], movement = p.stages[0].movement;
    if (movement.kind !== "conveyor") continue;
    seenForward ||= movement.tracks.some(t => t.direction === 1);
    seenBackward ||= movement.tracks.some(t => t.direction === -1);
    const steps = conveyorSteps(state.board, pair, movement);
    const result = attemptMatch(p, state, pair);
    assert.ok(result.ok);
    if (!result.ok) continue;
    for (const step of steps) {
      assert.ok(step.fruit > 0);
      assert.notDeepEqual(step.from, pair.a);
      assert.notDeepEqual(step.from, pair.b);
      assert.equal(result.state.board[step.to.r][step.to.c], step.fruit);
      assert.equal(Math.abs(step.from.r - step.to.r) + Math.abs(step.from.c - step.to.c), 1);
    }
  }
  assert.ok(seenForward && seenBackward);
});
test("nonconveyor mechanics and empty track positions create no phantom fruit", () => {
  const pair = { a: { r: 0, c: 0 }, b: { r: 0, c: 1 } };
  assert.deepEqual(conveyorSteps([[1, 1]], pair, { kind: "none" }), []);
  assert.deepEqual(conveyorSteps([[1, 1], [0, 0]], pair, { kind: "conveyor", tracks: [{ cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 0 }], direction: 1 }] }), []);
});
