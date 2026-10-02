export class CaptureBudgetExceeded extends Error {
  constructor(message, details) {
    super(message);
    this.name = "CaptureBudgetExceeded";
    this.code = "CAPTURE_BUDGET_EXCEEDED";
    this.details = details;
  }
}

const monotonicNow = () => performance.now();

export function createCaptureBudget({
  limitMs = 12 * 60 * 1000,
  gameplayMs = 8 * 60 * 1000,
  evidenceMs = 3 * 60 * 1000,
  closeMs = 60 * 1000,
  now = monotonicNow,
} = {}) {
  if (limitMs <= 0 || gameplayMs <= 0 || evidenceMs <= 0 || closeMs <= 0)
    throw new RangeError("Capture budget phases must be positive");
  if (gameplayMs + evidenceMs + closeMs > limitMs)
    throw new RangeError("Capture budget phases exceed the total limit");

  const startedAt = now();
  const phaseLimits = { gameplay: gameplayMs, evidence: evidenceMs, close: closeMs };
  let phase = "gameplay";
  let phaseStartedAt = startedAt;
  let actions = 0;

  const elapsedMs = () => Math.max(0, now() - startedAt);
  const snapshot = () => {
    const elapsed = elapsedMs();
    return {
      phase,
      actions,
      elapsedMs: elapsed,
      remainingMs: Math.max(0, limitMs - elapsed),
      phaseRemainingMs: Math.max(0, phaseLimits[phase] - Math.max(0, now() - phaseStartedAt)),
      limitMs,
    };
  };
  const assertTime = (operation = "operation") => {
    const state = snapshot();
    if (state.remainingMs <= 0 || state.phaseRemainingMs <= 0)
      throw new CaptureBudgetExceeded(
        `${operation} refused after the ${state.phase} budget expired`,
        state,
      );
    return state;
  };
  const setPhase = nextPhase => {
    if (!Object.hasOwn(phaseLimits, nextPhase))
      throw new RangeError(`Unknown capture phase: ${nextPhase}`);
    const state = snapshot();
    if (state.remainingMs <= 0)
      throw new CaptureBudgetExceeded(
        `enter ${nextPhase} refused after the total budget expired`,
        state,
      );
    phase = nextPhase;
    phaseStartedAt = now();
    return snapshot();
  };
  const startAction = operation => {
    const state = assertTime(operation);
    actions += 1;
    return { ...state, actions };
  };
  const finish = () => ({ ...snapshot(), finishedAt: now() });

  return Object.freeze({
    snapshot,
    assertTime,
    setPhase,
    startAction,
    finish,
  });
}

if (process.argv[1]?.endsWith("capture-budget.mjs")) {
  const budget = createCaptureBudget();
  console.log(JSON.stringify(budget.snapshot(), null, 2));
}
