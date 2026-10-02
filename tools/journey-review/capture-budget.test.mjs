import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptureBudgetExceeded, createCaptureBudget } from "./capture-budget.mjs";

function clock() {
  let value = 0;
  return { now: () => value, advance: ms => (value += ms) };
}

test("budget reserves gameplay, evidence and closeout time", () => {
  const time = clock();
  const budget = createCaptureBudget({
    limitMs: 720,
    gameplayMs: 480,
    evidenceMs: 180,
    closeMs: 60,
    now: time.now,
  });
  assert.equal(budget.startAction("match").actions, 1);
  time.advance(479);
  assert.equal(budget.snapshot().phaseRemainingMs, 1);
  time.advance(1);
  assert.throws(() => budget.startAction("match"), CaptureBudgetExceeded);
  assert.equal(budget.snapshot().remainingMs, 240);
  assert.equal(budget.setPhase("evidence").phase, "evidence");
  time.advance(179);
  assert.doesNotThrow(() => budget.setPhase("close"));
  assert.equal(budget.startAction("close browser").actions, 2);
});

test("total deadline stops work even when a phase is not exhausted", () => {
  const time = clock();
  const budget = createCaptureBudget({ limitMs: 100, gameplayMs: 50, evidenceMs: 30, closeMs: 20, now: time.now });
  time.advance(100);
  assert.throws(() => budget.assertTime("late action"), error => error.code === "CAPTURE_BUDGET_EXCEEDED");
});

test("invalid phase allocations fail before the browser starts", () => {
  assert.throws(() => createCaptureBudget({ limitMs: 10, gameplayMs: 5, evidenceMs: 5, closeMs: 5 }), RangeError);
  assert.throws(() => createCaptureBudget({ limitMs: 0 }), RangeError);
});
