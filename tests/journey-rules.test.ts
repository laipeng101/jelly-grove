import test from "node:test";
import assert from "node:assert/strict";
import { findPath, type Board } from "../src/engine";
import {
  attemptMatch,
  challengeMet,
  initialState,
  legalMoves,
  rotatePreview,
  validatePuzzle,
} from "../src/journey/rules";
import {
  createSession,
  earnedStars,
  playMove,
  retrySession,
  undoMove,
} from "../src/journey/session";
import {
  emptyJourneySave,
  KEY,
  MAX_JOURNEY_SAVE_CHARACTERS,
  MAX_JOURNEY_SAVE_FILE_BYTES,
  loadJourneySave,
  parseJourneySave,
  recordJourneyResult,
  serializeJourneySave,
  writeJourneySave,
} from "../src/journey/storage";
import type { Move, Puzzle, Stage } from "../src/journey/types";

const move = (r: number, c: number, rr: number, cc: number): Move => ({
  a: { r, c },
  b: { r: rr, c: cc },
});
const clear: Stage = {
  goal: { kind: "clear" },
  movement: { kind: "none" },
  ports: [],
};
const fixture = (board: Board, stages: Stage[] = [clear]): Puzzle => ({
  version: 1,
  generatorVersion: 1,
  themeId: 13,
  id: "rules-fixture",
  seed: 1,
  initial: board,
  stages,
  challenge: { kind: "fuel", limit: 72 },
  proof: { win: [], challenge: [], ordinary: [], critical: [], notes: [] },
});
const play = (session: ReturnType<typeof createSession>, action: Move) => {
  const result = playMove(session, action);
  assert.equal(result.ok, true);
  return result;
};
const storageFixture = (): Puzzle => {
  const puzzle = fixture(
    [[1, 1, 2, 2]],
    [
      {
        goal: { kind: "collect", quotas: { 1: 1 } },
        movement: { kind: "none" },
        ports: [],
      },
    ],
  );
  puzzle.challenge = { kind: "preserve", fruit: 2, pairs: 1 };
  puzzle.proof = {
    win: [move(0, 0, 0, 1)],
    challenge: [move(0, 0, 0, 1)],
    ordinary: [move(0, 2, 0, 3), move(0, 0, 0, 1)],
    critical: [],
    notes: [],
  };
  return puzzle;
};

test("outside matching reserves the current and every later quota; rejection is atomic", () => {
  const puzzle = fixture(
    [[1, 1, 1, 1, 2, 2]],
    [
      {
        goal: { kind: "deliver", quotas: { 1: 1 } },
        movement: { kind: "none" },
        ports: [{ r: 0, c: 0 }],
      },
      {
        goal: { kind: "collect", quotas: { 1: 1 } },
        movement: { kind: "none" },
        ports: [],
      },
    ],
  );
  const session = createSession(puzzle),
    before = structuredClone(session);
  const rejected = playMove(session, move(0, 2, 0, 3));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.reason, /4 颗/);
  assert.deepEqual(session, before);
  assert(
    !legalMoves(puzzle, session.state).some((m) => m.a.c === 2 && m.b.c === 3),
  );
  play(session, move(0, 0, 0, 1));
  assert.equal(session.state.stageIndex, 1);
  assert.deepEqual(session.state.progress, [{ 1: 1 }, {}]);
  play(session, move(0, 2, 0, 3));
  assert.equal(session.state.phase, "won");
});

test("a successful match rotates both tracks simultaneously, including blanks; a preview is pure", () => {
  const cells = (c: number) => [
    { r: 0, c },
    { r: 0, c: c + 1 },
    { r: 1, c: c + 1 },
    { r: 1, c },
  ];
  const puzzle = fixture(
    [
      [1, 0, 2, 0],
      [0, 1, 0, 2],
      [3, 3, 0, 0],
    ],
    [
      {
        goal: { kind: "deliver", quotas: { 1: 1, 2: 1 } },
        ports: [
          { r: 0, c: 1 },
          { r: 0, c: 3 },
        ],
        movement: {
          kind: "conveyor",
          tracks: [
            { cells: cells(0), direction: 1 },
            { cells: cells(2), direction: -1 },
          ],
        },
      },
    ],
  );
  const session = createSession(puzzle),
    before = structuredClone(session);
  assert.deepEqual(rotatePreview(puzzle, session.state), [
    [0, 1, 0, 2],
    [1, 0, 2, 0],
    [3, 3, 0, 0],
  ]);
  assert.deepEqual(session, before);
  play(session, move(2, 0, 2, 1));
  assert.deepEqual(session.state.board, [
    [0, 1, 0, 2],
    [1, 0, 2, 0],
    [0, 0, 0, 0],
  ]);
  const result = play(session, move(0, 1, 1, 0));
  assert(result.ok && result.delivered === 1);
  assert.equal(session.state.progress[0][1], 1);
  assert.deepEqual(session.state.board, [
    [0, 0, 2, 0],
    [0, 0, 0, 2],
    [0, 0, 0, 0],
  ]);
});

test("being carried onto a port does not itself deliver a target", () => {
  const puzzle = fixture(
    [
      [1, 0, 0, 0],
      [0, 1, 2, 2],
    ],
    [
      {
        goal: { kind: "deliver", quotas: { 1: 1 } },
        ports: [{ r: 0, c: 1 }],
        movement: {
          kind: "conveyor",
          tracks: [
            {
              cells: [
                { r: 0, c: 0 },
                { r: 0, c: 1 },
                { r: 1, c: 1 },
                { r: 1, c: 0 },
              ],
              direction: 1,
            },
          ],
        },
      },
    ],
  );
  const session = createSession(puzzle);
  play(session, move(1, 2, 1, 3));
  assert.equal(session.state.board[0][1], 1);
  assert.deepEqual(session.state.progress, [{}]);
  assert.equal(session.state.phase, "playing");
});

test("compaction respects stones and order in both directions", () => {
  const board = [
    [0, 1, 1, -1, 0, 2],
    [3, 0, 0, -1, 2, 0],
    [-1, -1, -1, -1, -1, -1],
    [0, 3, 4, -1, 4, 0],
  ];
  const puzzle = fixture(board, [
    { ...clear, movement: { kind: "compact", direction: "left" } },
  ]);
  assert.deepEqual(rotatePreview(puzzle, initialState(puzzle)), [
    [1, 1, 0, -1, 2, 0],
    [3, 0, 0, -1, 2, 0],
    [-1, -1, -1, -1, -1, -1],
    [3, 4, 0, -1, 4, 0],
  ]);
  puzzle.stages[0].movement = { kind: "compact", direction: "down" };
  assert.deepEqual(rotatePreview(puzzle, initialState(puzzle)), [
    [0, 0, 0, -1, 0, 0],
    [3, 1, 1, -1, 2, 2],
    [-1, -1, -1, -1, -1, -1],
    [0, 3, 4, -1, 4, 0],
  ]);
});

test("last-budget-step completion wins and a stage transition preserves board without an extra shift", () => {
  const puzzle = fixture(
    [
      [1, 1, 0, 0],
      [2, 0, 2, 0],
      [3, 3, 0, 0],
    ],
    [
      {
        goal: { kind: "collect", quotas: { 1: 1 } },
        movement: { kind: "compact", direction: "left" },
        ports: [],
        budget: 1,
      },
      {
        goal: { kind: "deliver", quotas: { 2: 1 } },
        movement: {
          kind: "conveyor",
          tracks: [
            {
              direction: 1,
              cells: [
                { r: 0, c: 0 },
                { r: 0, c: 1 },
                { r: 1, c: 1 },
                { r: 1, c: 0 },
              ],
            },
          ],
        },
        ports: [{ r: 1, c: 0 }],
        budget: 1,
      },
    ],
  );
  const session = createSession(puzzle);
  play(session, move(0, 0, 0, 1));
  assert.equal(session.state.stageMoves, 0);
  assert.deepEqual(session.state.board[1], [2, 2, 0, 0]);
  play(session, move(1, 0, 1, 1));
  assert.equal(session.state.phase, "won");
  assert.equal(session.state.stageMoves, 1);
  assert.deepEqual(session.state.board[2], [3, 3, 0, 0]);
});

test("budget loss and no-allowed-move loss both allow an exact undo", () => {
  for (const budget of [1, undefined]) {
    const puzzle = fixture(
      [[1, 1, 2, 2]],
      [
        {
          goal: { kind: "deliver", quotas: { 2: 1 } },
          movement: { kind: "none" },
          ports: [{ r: 0, c: 0 }],
          budget,
        },
      ],
    );
    const session = createSession(puzzle),
      before = structuredClone(session.state);
    play(session, move(0, 0, 0, 1));
    assert.equal(session.state.phase, "lost");
    assert.match(session.state.failure!, budget ? /次数/ : /没有可消除/);
    assert(undoMove(session));
    assert.deepEqual(session.state, before);
    assert.equal(session.actions.length, 0);
  }
});

test("a physical first arrival missed behind a blocked route fails the first-window challenge", () => {
  const puzzle = fixture(
    [
      [1, -1, 1],
      [-1, -1, -1],
      [2, 2, 0],
    ],
    [
      {
        goal: { kind: "deliver", quotas: { 1: 1 } },
        movement: { kind: "none" },
        ports: [{ r: 0, c: 0 }],
      },
    ],
  );
  // Even when no connection is available, physically arriving at a port opens the window.
  puzzle.initial = [
    [-1, -1, -1, 0],
    [-1, 1, -1, 1],
    [-1, -1, -1, 0],
    [2, 2, 0, 0],
  ];
  puzzle.stages[0].ports = [{ r: 1, c: 1 }];
  puzzle.challenge = { kind: "first-window", fruits: [1] };
  const session = createSession(puzzle);
  assert.equal(
    findPath(session.state.board, { r: 1, c: 1 }, { r: 1, c: 3 }),
    null,
  );
  play(session, move(3, 0, 3, 1));
  assert.deepEqual(session.state.missedFirst, [1]);
  assert.equal(challengeMet(puzzle, session.state), false);
  undoMove(session);
  assert.deepEqual(session.state.missedFirst, []);
});

test("first-window delivery uses pre-movement positions and extra targets outside ports count", () => {
  const puzzle = fixture(
    [[1, 1, 1, 1, 2, 2]],
    [
      {
        goal: { kind: "deliver", quotas: { 1: 1 } },
        movement: { kind: "none" },
        ports: [{ r: 0, c: 0 }],
      },
    ],
  );
  puzzle.challenge = { kind: "first-window", fruits: [1] };
  const session = createSession(puzzle);
  play(session, move(0, 2, 0, 3));
  assert.equal(session.state.outsideTargets, 1);
  assert.deepEqual(session.state.missedFirst, [1]);
  play(session, move(0, 0, 0, 1));
  assert.equal(session.state.phase, "won");
  assert.equal(earnedStars(session), 2);
  const retry = retrySession(session);
  play(retry, move(0, 0, 0, 1));
  assert.deepEqual(retry.state.firstDelivered, [1]);
  assert.equal(earnedStars(retry), 3);
});

test("all 24 history entries and all rewards restore, including after winning and refreshing", () => {
  const puzzle = fixture(
    Array.from({ length: 8 }, () => [1, 1, 1, 1, 1, 1]),
    [
      {
        goal: { kind: "deliver", quotas: { 1: 1 } },
        ports: [{ r: 7, c: 4 }],
        movement: { kind: "none" },
      },
    ],
  );
  puzzle.initial[7][0] = puzzle.initial[7][1] = 2;
  puzzle.challenge = { kind: "preserve", fruit: 2, pairs: 1 };
  const complete: Move[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 6; c += 2) complete.push(move(r, c, r, c + 1));
  puzzle.proof = {
    win: complete,
    challenge: [move(7, 4, 7, 5)],
    ordinary: complete,
    critical: [],
    notes: [],
  };
  const session = createSession(puzzle),
    start = structuredClone(session.state);
  for (const action of complete) play(session, action);
  assert.equal(session.state.phase, "won");
  assert.equal(session.history.length, 24);
  assert.equal(session.state.combo, 24);
  assert.equal(session.state.score, 6675);
  assert.equal(session.state.blooms, 4);
  assert.equal(session.state.fuelUsed, 1);
  const save = emptyJourneySave();
  save.session = session;
  const restored = parseJourneySave(JSON.stringify(save));
  assert.deepEqual(restored.session, session);
  for (let i = 0; i < 24; i++) assert(undoMove(restored.session!));
  assert.deepEqual(restored.session!.state, start);
  assert.equal(undoMove(restored.session!), false);
});

test("hints survive undo/retry/load; records are idempotent single-run best scores", () => {
  const puzzle = storageFixture();
  const session = createSession(puzzle, 2),
    save = emptyJourneySave();
  play(session, move(0, 0, 0, 1));
  assert.equal(earnedStars(session), 2);
  recordJourneyResult(save, session);
  recordJourneyResult(save, session);
  assert.equal(save.best[13], 2);
  assert.deepEqual(save.hinted, [puzzle.id]);
  undoMove(session);
  assert.equal(session.hintLevel, 2);
  recordJourneyResult(save, session);
  assert.equal(save.best[13], 2);
  assert.equal(retrySession(session).hintLevel, 2);
  save.session = createSession(puzzle, 0);
  assert.equal(parseJourneySave(JSON.stringify(save)).session!.hintLevel, 1);
  const otherPuzzle = structuredClone(puzzle);
  otherPuzzle.id = "other-random-puzzle";
  const ordinary = createSession(otherPuzzle);
  play(ordinary, move(0, 2, 0, 3));
  play(ordinary, move(0, 0, 0, 1));
  assert.equal(earnedStars(ordinary), 2);
  recordJourneyResult(save, ordinary);
  assert.equal(
    save.best[13],
    2,
    "two runs must not combine independent and challenge stars",
  );
});

test("save restoration rejects fabricated state, fabricated history, invalid actions and incompatible versions", () => {
  const save = emptyJourneySave();
  save.session = createSession(storageFixture());
  play(save.session, move(0, 2, 0, 3));
  const mutate = (fn: (s: typeof save) => void) => {
    const bad = structuredClone(save);
    fn(bad);
    assert.throws(() => parseJourneySave(JSON.stringify(bad)));
  };
  mutate((s) => {
    s.session!.state.score += 100;
  });
  mutate((s) => {
    s.session!.history[0].board[0][0] = 0;
  });
  mutate((s) => {
    s.session!.actions[0].b.c = 2;
  });
  mutate((s) => {
    s.session!.puzzle.generatorVersion = 99;
  });
  mutate((s) => {
    s.session!.history = [];
  });
  mutate((s) => {
    delete (s.session as Partial<typeof s.session>)!.hintLevel;
  });
  mutate((s) => {
    s.session!.puzzle.proof.challenge = s.session!.puzzle.proof.ordinary;
  });
  mutate((s) => {
    s.session!.puzzle.proof.ordinary = s.session!.puzzle.proof.challenge;
  });
  mutate((s) => {
    s.session!.puzzle.proof.win = [];
  });
  const reordered = JSON.stringify(save, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse())
      : value,
  );
  assert.deepEqual(parseJourneySave(reordered).session, save.session);
});

test("storage recovery distinguishes denied reads from exact readable damaged content", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const original = '{\r\n  "损坏🍊": true,\r\n';
  let denied = true;
  let reads = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        reads++;
        if (denied) throw new DOMException("Denied", "SecurityError");
        return original;
      },
      setItem: () => assert.fail("recovery must not write storage"),
    },
  });
  try {
    const unavailable = loadJourneySave();
    assert.deepEqual(unavailable.save, emptyJourneySave());
    assert.match(unavailable.warning!, /无法读取.*存档/);
    assert.equal(unavailable.rawBackup, undefined);
    denied = false;
    const damaged = loadJourneySave();
    assert(damaged.warning);
    denied = true;
    assert.equal(damaged.rawBackup, original);
    assert.deepEqual(damaged.save, emptyJourneySave());
    assert.equal(reads, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("a full hint ledger stays readable through hint, load, undo, retry and result recording", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  try {
    for (const count of [9_999, 10_000]) {
      const input = emptyJourneySave();
      input.hinted = Array.from({ length: count }, (_, i) => `earlier-${i}`);
      input.session = createSession(storageFixture());
      const save = parseJourneySave(JSON.stringify(input));
      play(save.session!, move(0, 2, 0, 3));
      save.session!.hintLevel = 2;
      assert(writeJourneySave(save));
      const restored = loadJourneySave();
      assert.equal(restored.warning, undefined);
      assert.deepEqual(restored.save, save);
      assert.equal(save.hinted.length, 10_000);
      assert.equal(save.hinted.at(-1), save.session!.puzzle.id);
      assert(undoMove(restored.save.session!));
      restored.save.session = retrySession(restored.save.session!);
      play(restored.save.session, move(0, 0, 0, 1));
      recordJourneyResult(restored.save, restored.save.session);
      assert.equal(restored.save.best[13], 2);
      assert.equal(restored.save.session.hintLevel, 2);
      assert(writeJourneySave(restored.save));
      assert.deepEqual(loadJourneySave().save, restored.save);
    }
    const imported = emptyJourneySave();
    imported.hinted = Array.from({ length: 10_000 }, (_, i) => `earlier-${i}`);
    imported.session = createSession(storageFixture(), 3);
    const normalized = parseJourneySave(JSON.stringify(imported));
    assert.equal(normalized.hinted.length, 10_000);
    assert.equal(normalized.hinted.at(-1), imported.session.puzzle.id);
    assert.deepEqual(parseJourneySave(JSON.stringify(normalized)), normalized);
    // Runtime duplicate IDs cannot grow the ledger or evict the current hint.
    normalized.hinted.push(normalized.session!.puzzle.id);
    normalized.session!.hintLevel = 0;
    assert(writeJourneySave(normalized));
    assert.equal(normalized.session!.hintLevel, 1);
    assert.equal(normalized.hinted.length, 10_000);
    assert.deepEqual(loadJourneySave().save, normalized);

    const priorText = memory.get(KEY);
    const oversized = { ...normalized, unexpected: "x".repeat(4_000_000) };
    assert.equal(writeJourneySave(oversized), false);
    assert.equal(
      memory.get(KEY),
      priorText,
      "failed writes preserve the prior readable save",
    );
    const corrupt = structuredClone(normalized);
    corrupt.session!.state.score++;
    assert.equal(writeJourneySave(corrupt), false);
    assert.equal(memory.get(KEY), priorText);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("validated compact exports round-trip Unicode and character-limit saves even when storage is unavailable", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  let unavailable = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (unavailable) throw new Error("Storage quota exceeded");
        memory.set(key, value);
      },
    },
  });
  try {
    const unicode = emptyJourneySave();
    unicode.session = createSession(storageFixture(), 2);
    play(unicode.session, move(0, 2, 0, 3));
    unicode.best = { 13: 2, 14: 3 };
    unicode.hinted = Array.from(
      { length: 6000 },
      (_, i) => "果".repeat(294) + String(i).padStart(6, "0"),
    );
    assert(writeJourneySave(unicode));
    const exported = serializeJourneySave(unicode);
    assert.equal(memory.get(KEY), exported);
    assert(Buffer.byteLength(exported, "utf8") > 5_000_000);
    assert(Buffer.byteLength(exported, "utf8") <= MAX_JOURNEY_SAVE_FILE_BYTES);
    assert.deepEqual(parseJourneySave(exported), unicode);
    assert.equal(unicode.session.hintLevel, 2);
    assert.equal(unicode.hinted.at(-1), unicode.session.puzzle.id);

    // The reader accepts extension fields: a valid compact save may reach its exact
    // character cap, where adding pretty-print whitespace makes its backup unreadable.
    const dense = { ...unicode, padding: "" };
    dense.padding = "x".repeat(
      MAX_JOURNEY_SAVE_CHARACTERS - JSON.stringify(dense).length,
    );
    assert(writeJourneySave(dense));
    const denseExport = serializeJourneySave(dense);
    assert.equal(denseExport.length, MAX_JOURNEY_SAVE_CHARACTERS);
    assert.equal(memory.get(KEY), denseExport);
    assert(
      Buffer.byteLength(denseExport, "utf8") <= MAX_JOURNEY_SAVE_FILE_BYTES,
    );
    assert.deepEqual(parseJourneySave(denseExport), unicode);
    assert(JSON.stringify(dense, null, 2).length > MAX_JOURNEY_SAVE_CHARACTERS);
    assert.throws(
      () => parseJourneySave(JSON.stringify(dense, null, 2)),
      /过大/,
    );

    unavailable = true;
    assert.equal(writeJourneySave(dense), false);
    assert.equal(serializeJourneySave(dense), denseExport);
    assert.equal(memory.get(KEY), denseExport);
    unavailable = false;
    dense.padding += "x";
    assert.throws(() => serializeJourneySave(dense), /过大/);
    assert.equal(writeJourneySave(dense), false);
    assert.equal(
      memory.get(KEY),
      denseExport,
      "failed exports/writes retain the prior save",
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("structural validation rejects crossed tracks, stone tracks, insufficient future supply and invalid coordinates", () => {
  const puzzle = fixture([[1, 1, 2, 2]]);
  assert(validatePuzzle(puzzle));
  const bad = structuredClone(puzzle);
  bad.stages[0].movement = {
    kind: "conveyor",
    tracks: [
      {
        direction: 1,
        cells: [
          { r: 0, c: 0 },
          { r: 0, c: 1 },
        ],
      },
      {
        direction: 1,
        cells: [
          { r: 0, c: 1 },
          { r: 0, c: 2 },
        ],
      },
    ],
  };
  assert.equal(validatePuzzle(bad), false);
  bad.stages[0].movement = { kind: "none" };
  bad.stages = [0, 1].map(() => ({
    goal: { kind: "collect", quotas: { 1: 1 } },
    ports: [],
    movement: { kind: "none" },
  }));
  assert.equal(validatePuzzle(bad), false);
  const session = createSession(puzzle);
  for (const action of [
    move(0.5, 0, 0, 1),
    move(-1, 0, 0, 1),
    move(0, 0, 0, 0),
    move(0, 0, 100, 1),
  ])
    assert.equal(attemptMatch(puzzle, session.state, action).ok, false);
});

test("independent small-board exhaustive model checks paths, quota protection, movement, credit and terminal states", () => {
  // A grid-search oracle independent of engine.findPath and the production transition.
  const connected = (board: Board, action: Move): boolean => {
    const { a, b } = action,
      h = board.length,
      w = board[0].length;
    if (board[a.r][a.c] <= 0 || board[a.r][a.c] !== board[b.r][b.c])
      return false;
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const queue = [{ r: a.r, c: a.c, d: -1, turns: 0 }],
      seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (p.r === b.r && p.c === b.c) return true;
      for (let d = 0; d < 4; d++) {
        const r = p.r + directions[d][0],
          c = p.c + directions[d][1],
          turns = p.turns + Number(p.d !== -1 && d !== p.d);
        if (turns > 2 || r < -1 || c < -1 || r > h || c > w) continue;
        if (r === a.r && c === a.c) continue;
        if (
          r >= 0 &&
          r < h &&
          c >= 0 &&
          c < w &&
          board[r][c] !== 0 &&
          !(r === b.r && c === b.c)
        )
          continue;
        const key = [r, c, d, turns].join();
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ r, c, d, turns });
        }
      }
    }
    return false;
  };
  const actions = (board: Board): Move[] => {
    const result: Move[] = [];
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) {
        const action = move(Math.floor(i / 3), i % 3, Math.floor(j / 3), j % 3);
        const fruit = board[action.a.r][action.a.c],
          targetCredit = fruit === 1 && (i === 0 || j === 0);
        if (
          connected(board, action) &&
          (fruit !== 1 ||
            targetCredit ||
            board.flat().filter((v) => v === 1).length >= 4)
        )
          result.push(action);
      }
    return result;
  };
  const permutations = (values: number[]): number[][] =>
    values.length
      ? [...new Set(values)].flatMap((v) => {
          const rest = [...values];
          rest.splice(rest.indexOf(v), 1);
          return permutations(rest).map((tail) => [v, ...tail]);
        })
      : [[]];
  let checked = 0;
  for (const values of [
    [1, 1, 2, 2, 0, 0],
    [1, 1, 1, 1, 2, 2],
    [1, 1, 2, 2, -1, 0],
  ]) {
    for (const cells of permutations(values))
      for (const rotating of [false, true]) {
        if (cells[0] === -1 || (rotating && cells.includes(-1))) continue;
        const board = [cells.slice(0, 3), cells.slice(3)],
          track = [0, 1, 2, 5, 4, 3];
        const puzzle = fixture(board, [
          {
            goal: { kind: "deliver", quotas: { 1: 1 } },
            ports: [{ r: 0, c: 0 }],
            movement: rotating
              ? {
                  kind: "conveyor",
                  tracks: [
                    {
                      direction: 1,
                      cells: track.map((i) => ({
                        r: Math.floor(i / 3),
                        c: i % 3,
                      })),
                    },
                  ],
                }
              : { kind: "none" },
          },
        ]);
        const state = initialState(puzzle),
          expected = actions(board);
        const identity = (m: Move) => [m.a.r, m.a.c, m.b.r, m.b.c].join();
        assert.deepEqual(
          legalMoves(puzzle, state).map(identity).sort(),
          expected.map(identity).sort(),
        );
        for (const action of expected) {
          const result = attemptMatch(puzzle, state, action);
          assert(result.ok);
          const fruit = board[action.a.r][action.a.c],
            credit =
              fruit === 1 &&
              ((action.a.r === 0 && action.a.c === 0) ||
                (action.b.r === 0 && action.b.c === 0));
          const after = board.map((row) => [...row]);
          after[action.a.r][action.a.c] = after[action.b.r][action.b.c] = 0;
          if (rotating) {
            const snapshot = after.flat();
            for (let i = 0; i < track.length; i++) {
              const to = track[(i + 1) % track.length];
              after[Math.floor(to / 3)][to % 3] = snapshot[track[i]];
            }
          }
          assert.deepEqual(result.state.board, after);
          assert.equal(result.delivered, credit ? 1 : null);
          assert.equal(
            result.state.phase,
            credit ? "won" : actions(after).length ? "playing" : "lost",
          );
          checked++;
        }
      }
  }
  assert(checked > 500, `${checked} independent transitions`);
});
