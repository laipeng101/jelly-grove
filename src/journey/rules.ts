import {
  applyGravity,
  clone,
  findPairs,
  findPath,
  same,
  type Board,
  type Point,
} from "../engine";
import {
  GENERATOR_VERSION,
  RULE_VERSION,
  type JourneyState,
  type MatchResult,
  type Move,
  type Movement,
  type Puzzle,
  type Stage,
} from "./types";

const copy = <T>(value: T): T => structuredClone(value);
const key = (p: Point) => `${p.r},${p.c}`;
const count = (board: Board, fruit: number) =>
  board.reduce((n, row) => n + row.filter((v) => v === fruit).length, 0);
const isPort = (stage: Stage, p: Point) =>
  stage.ports.some((port) => same(port, p));

function credit(
  puzzle: Puzzle,
  state: JourneyState,
  move: Move,
): number | null {
  const stage = puzzle.stages[state.stageIndex],
    fruit = state.board[move.a.r][move.a.c];
  if (
    stage.goal.kind === "clear" ||
    (stage.goal.quotas[fruit] || 0) <=
      (state.progress[state.stageIndex][fruit] || 0)
  )
    return null;
  return stage.goal.kind === "collect" ||
    isPort(stage, move.a) ||
    isPort(stage, move.b)
    ? fruit
    : null;
}

function reservedPairs(
  puzzle: Puzzle,
  state: JourneyState,
  fruit: number,
): number {
  return puzzle.stages.reduce(
    (n, stage, i) =>
      n +
      (i >= state.stageIndex && stage.goal.kind !== "clear"
        ? Math.max(
            0,
            (stage.goal.quotas[fruit] || 0) - (state.progress[i][fruit] || 0),
          )
        : 0),
    0,
  );
}

function guard(puzzle: Puzzle, state: JourneyState, move: Move): string | null {
  const fruit = state.board[move.a.r][move.a.c];
  const needed =
    reservedPairs(puzzle, state, fruit) -
    (credit(puzzle, state, move) === fruit ? 1 : 0);
  return count(state.board, fruit) - 2 < needed * 2
    ? `还需为当前及后续订单保留 ${needed * 2} 颗同类水果。`
    : null;
}

function moveBoard(board: Board, movement: Movement): Board {
  if (movement.kind === "none") return clone(board);
  if (movement.kind === "compact") {
    if (movement.direction === "down") return applyGravity(board);
    const result = clone(board);
    for (const row of result) {
      let start = 0;
      for (let end = 0; end <= row.length; end++)
        if (end === row.length || row[end] === -1) {
          const values = row.slice(start, end).filter((v) => v > 0);
          for (let c = start; c < end; c++) row[c] = values[c - start] || 0;
          start = end + 1;
        }
    }
    return result;
  }
  const result = clone(board);
  for (const track of movement.tracks)
    track.cells.forEach((from, i) => {
      const to =
        track.cells[
          (i + track.direction + track.cells.length) % track.cells.length
        ];
      result[to.r][to.c] = board[from.r][from.c];
    });
  return result;
}

/** Preview moves existing contents, including empty cells, without a match or state change. */
export function rotatePreview(puzzle: Puzzle, state: JourneyState): Board {
  return moveBoard(state.board, puzzle.stages[state.stageIndex].movement);
}

export function legalMoves(puzzle: Puzzle, state: JourneyState): Move[] {
  if (state.phase !== "playing") return [];
  return findPairs(state.board)
    .filter((move) => !guard(puzzle, state, move))
    .map(({ a, b }) => ({ a, b }));
}

function goalMet(puzzle: Puzzle, state: JourneyState): boolean {
  const goal = puzzle.stages[state.stageIndex].goal;
  return goal.kind === "clear"
    ? !state.board.some((row) => row.some((v) => v > 0))
    : Object.entries(goal.quotas).every(
        ([fruit, amount]) =>
          (state.progress[state.stageIndex][Number(fruit)] || 0) >= amount,
      );
}

/** Completion takes precedence over budget failure, and a stage transition never moves twice. */
function settle(puzzle: Puzzle, state: JourneyState): void {
  while (goalMet(puzzle, state)) {
    if (state.stageIndex === puzzle.stages.length - 1) {
      state.phase = "won";
      return;
    }
    state.stageIndex++;
    state.stageMoves = 0;
  }
  const budget = puzzle.stages[state.stageIndex].budget;
  if (budget !== undefined && state.stageMoves >= budget) {
    state.phase = "lost";
    state.failure = "本阶段的消除次数已用完，可以撤销后重新推演。";
  } else if (!legalMoves(puzzle, state).length) {
    state.phase = "lost";
    state.failure = "没有可消除且符合订单配额的配对，可以撤销后重新推演。";
  }
}

export function initialState(puzzle: Puzzle): JourneyState {
  const state: JourneyState = {
    board: clone(puzzle.initial),
    stageIndex: 0,
    progress: puzzle.stages.map(() => ({})),
    stageMoves: 0,
    moves: 0,
    combo: 0,
    score: 0,
    juice: 0,
    blooms: 0,
    fuelUsed: 0,
    outsideTargets: 0,
    firstDelivered: [],
    missedFirst: [],
    phase: "playing",
    failure: null,
  };
  settle(puzzle, state);
  return state;
}

export function attemptMatch(
  puzzle: Puzzle,
  state: JourneyState,
  move: Move,
): MatchResult {
  if (state.phase !== "playing")
    return { ok: false, reason: "本盘已结束，可以撤销或重试。" };
  if (
    ![move?.a, move?.b].every(
      (p) => p && Number.isInteger(p.r) && Number.isInteger(p.c),
    )
  )
    return { ok: false, reason: "请选择棋盘内的两颗水果。" };
  const path = findPath(state.board, move.a, move.b);
  if (!path)
    return { ok: false, reason: "同类水果需要用不超过两弯的空路连接。" };
  const reason = guard(puzzle, state, move);
  if (reason) return { ok: false, reason };
  const next = copy(state),
    stage = puzzle.stages[state.stageIndex],
    fruit = state.board[move.a.r][move.a.c];
  const delivered = credit(puzzle, state, move);
  if (stage.goal.kind === "deliver") {
    for (const [type, quota] of Object.entries(stage.goal.quotas)) {
      const f = Number(type);
      if (
        (state.progress[state.stageIndex][f] || 0) >= quota ||
        next.firstDelivered.includes(f) ||
        next.missedFirst.includes(f)
      )
        continue;
      // The first physical arrival matters even when its connecting route is still blocked.
      if (stage.ports.some((p) => state.board[p.r][p.c] === f)) {
        (delivered === f ? next.firstDelivered : next.missedFirst).push(f);
      }
    }
    if (
      stage.goal.quotas[fruit] &&
      !isPort(stage, move.a) &&
      !isPort(stage, move.b)
    )
      next.outsideTargets++;
  }
  if (delivered !== null)
    next.progress[state.stageIndex][delivered] =
      (next.progress[state.stageIndex][delivered] || 0) + 1;
  if (
    !puzzle.stages.some((s) => s.goal.kind !== "clear" && s.goal.quotas[fruit])
  )
    next.fuelUsed++;
  next.board[move.a.r][move.a.c] = next.board[move.b.r][move.b.c] = 0;
  next.board = moveBoard(next.board, stage.movement);
  next.moves++;
  next.stageMoves++;
  next.combo++;
  next.score += 100 + Math.min(next.combo - 1, 9) * 25;
  next.juice += 12 + Math.min(next.combo - 1, 4) * 2;
  const bloomed = next.juice >= 100;
  if (bloomed) {
    next.juice = 0;
    next.blooms++;
  }
  settle(puzzle, next);
  return { ok: true, state: next, path, delivered, bloomed };
}

export function challengeMet(puzzle: Puzzle, state: JourneyState): boolean {
  if (state.phase !== "won") return false;
  const challenge = puzzle.challenge;
  switch (challenge.kind) {
    case "first-window":
      return challenge.fruits.every(
        (f) =>
          state.firstDelivered.includes(f) && !state.missedFirst.includes(f),
      );
    case "preserve":
      return count(state.board, challenge.fruit) >= challenge.pairs * 2;
    case "no-outside":
      return state.outsideTargets === 0;
    case "fuel":
      return state.fuelUsed <= challenge.limit;
  }
}

/** Structural validation only; the generator separately proves solutions and theme quality. */
export function validatePuzzle(puzzle: Puzzle): boolean {
  try {
    const int = (n: unknown, min: number, max: number) =>
      Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max;
    if (
      !puzzle ||
      puzzle.version !== RULE_VERSION ||
      puzzle.generatorVersion !== GENERATOR_VERSION ||
      !int(puzzle.themeId, 13, 18) ||
      !int(puzzle.seed, 0, 0xffffffff) ||
      typeof puzzle.id !== "string" ||
      !puzzle.id.length ||
      puzzle.id.length > 300
    )
      return false;
    const b = puzzle.initial,
      h = b?.length,
      w = b?.[0]?.length;
    if (
      !Array.isArray(b) ||
      !int(h, 1, 8) ||
      !int(w, 1, 6) ||
      !b.every(
        (row) =>
          Array.isArray(row) &&
          row.length === w &&
          row.every((v) => int(v, -1, 10)),
      )
    )
      return false;
    if (
      Array.from({ length: 10 }, (_, i) => count(b, i + 1)).some((n) => n % 2)
    )
      return false;
    const point = (p: Point) => p && int(p.r, 0, h - 1) && int(p.c, 0, w - 1);
    if (
      !Array.isArray(puzzle.stages) ||
      puzzle.stages.length < 1 ||
      puzzle.stages.length > 24
    )
      return false;
    const totals: Record<number, number> = {};
    for (const stage of puzzle.stages) {
      if (
        !stage ||
        !Array.isArray(stage.ports) ||
        !stage.ports.every((p) => point(p) && b[p.r][p.c] !== -1) ||
        new Set(stage.ports.map(key)).size !== stage.ports.length ||
        (stage.budget !== undefined && !int(stage.budget, 1, 144))
      )
        return false;
      if (stage.goal.kind !== "clear") {
        if (
          !["deliver", "collect"].includes(stage.goal.kind) ||
          !stage.goal.quotas ||
          typeof stage.goal.quotas !== "object" ||
          Array.isArray(stage.goal.quotas)
        )
          return false;
        const quotas = Object.entries(stage.goal.quotas);
        if (
          !quotas.length ||
          !quotas.every(([f, n]) => /^[1-9]$|^10$/.test(f) && int(n, 1, 72))
        )
          return false;
        for (const [f, n] of quotas)
          totals[Number(f)] = (totals[Number(f)] || 0) + n;
        if (stage.goal.kind === "deliver" && !stage.ports.length) return false;
      }
      if (stage.movement.kind === "conveyor") {
        if (
          !Array.isArray(stage.movement.tracks) ||
          !stage.movement.tracks.length
        )
          return false;
        const occupied = new Set<string>();
        for (const track of stage.movement.tracks) {
          if (
            !track ||
            ![1, -1].includes(track.direction) ||
            !Array.isArray(track.cells) ||
            track.cells.length < 2 ||
            track.cells.length > h * w
          )
            return false;
          for (let i = 0; i < track.cells.length; i++) {
            const p = track.cells[i],
              next = track.cells[(i + 1) % track.cells.length];
            if (!point(p) || b[p.r][p.c] === -1 || occupied.has(key(p)))
              return false;
            if (
              !point(next) ||
              Math.abs(next.r - p.r) + Math.abs(next.c - p.c) !== 1
            )
              return false;
            occupied.add(key(p));
          }
        }
      } else if (stage.movement.kind === "compact") {
        if (!["down", "left"].includes(stage.movement.direction)) return false;
      } else if (stage.movement.kind !== "none") return false;
    }
    if (Object.entries(totals).some(([f, n]) => count(b, Number(f)) < n * 2))
      return false;
    const c = puzzle.challenge;
    if (c.kind === "first-window") {
      if (
        !Array.isArray(c.fruits) ||
        !c.fruits.length ||
        new Set(c.fruits).size !== c.fruits.length ||
        !c.fruits.every(
          (f) =>
            int(f, 1, 10) &&
            puzzle.stages.some(
              (s) => s.goal.kind === "deliver" && s.goal.quotas[f],
            ),
        )
      )
        return false;
    } else if (c.kind === "preserve") {
      if (
        !int(c.fruit, 1, 10) ||
        !int(c.pairs, 1, 72) ||
        count(b, c.fruit) < c.pairs * 2
      )
        return false;
    } else if (c.kind === "fuel") {
      if (!int(c.limit, 0, 72)) return false;
    } else if (c.kind !== "no-outside") return false;
    const proof = puzzle.proof;
    const moves = (seq: Move[]) =>
      Array.isArray(seq) &&
      seq.length <= (h * w) / 2 &&
      seq.every((m) => m && point(m.a) && point(m.b) && !same(m.a, m.b));
    return (
      !!proof &&
      moves(proof.win) &&
      moves(proof.challenge) &&
      moves(proof.ordinary) &&
      Array.isArray(proof.critical) &&
      proof.critical.length <= 144 &&
      proof.critical.every(
        (c) =>
          c &&
          moves(c.prefix) &&
          moves([c.good]) &&
          moves([c.bad]) &&
          typeof c.consequence === "string" &&
          c.consequence.length <= 1000,
      ) &&
      (proof.minimumFuel === undefined || int(proof.minimumFuel, 0, 72)) &&
      Array.isArray(proof.notes) &&
      proof.notes.length <= 100 &&
      proof.notes.every((n) => typeof n === "string" && n.length <= 2000)
    );
  } catch {
    return false;
  }
}
