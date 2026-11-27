import test from "node:test";
import assert from "node:assert/strict";
import { classicLevel } from "../../../src/classic-levels.ts";
import { parseSave, type Save, type Game } from "../../../src/storage.ts";
import {
  generateBoard,
  LEVELS,
  remaining,
  findPairs,
  makeLayout,
  removePair,
  reshuffle,
  seedRandom,
  type Level,
} from "../../../src/engine.ts";
function fixture(): Save {
  const board = makeLayout(LEVELS[0]);
  const g: Game = {
    mode: "journey",
    level: 1,
    difficulty: 1,
    seed: 4_000_000_000,
    board,
    score: 0,
    cleared: 0,
    total: remaining(board),
    combo: 0,
    bestCombo: 0,
    juice: 0,
    fever: 0,
    lastMatch: 0,
    assists: 0,
    elapsed: 300,
    timeLeft: 120000,
    round: 1,
    phase: "playing",
    history: [],
  };
  return {
    version: 1,
    mode: "journey",
    stars: Array(24).fill(0),
    best: 0,
    freeBest: 0,
    totalPairs: 0,
    settings: { sound: true, motion: true, volume: 0.8 },
    sessions: { journey: g },
  };
}
test("progress including large random seeds survives serialization and retains current board", () => {
  const s = fixture();
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
});

test("import refuses arrays, invalid phases/counts, and history that could overwrite game metadata", () => {
  const mutations: ((s: Save) => void)[] = [
    (s) => {
      s.sessions = [] as unknown as Save["sessions"];
    },
    (s) => {
      (s.sessions as any).journey = null;
    },
    (s) => {
      (s.sessions as any).unknown = {};
    },
    (s) => {
      s.sessions.journey!.total++;
    },
    (s) => {
      s.sessions.journey!.cleared = 0.5;
    },
    (s) => {
      s.sessions.journey!.phase = "won";
    },
    (s) => {
      s.sessions.journey!.phase = "lost";
    },
    (s) => {
      s.sessions.journey!.lastMatch = 301;
    },
    (s) => {
      s.sessions.journey!.history = [
        { ...snapshot(s.sessions.journey!), mode: "sprint" } as any,
      ];
    },
    (s) => {
      s.sessions.journey!.history = [
        { ...snapshot(s.sessions.journey!), fever: 10001 },
      ];
    },
    (s) => {
      const h = snapshot(s.sessions.journey!);
      h.board = Array.from({ length: 6 }, () => Array(6).fill(1));
      s.sessions.journey!.history = [h];
    },
  ];
  for (const change of mutations) {
    const s = fixture();
    change(s);
    assert.throws(() => parseSave(JSON.stringify(s)));
  }
});

function snapshot(g: Game) {
  const { board, score, cleared, combo, bestCombo, juice, fever, lastMatch } =
    g;
  return {
    board: board.map((row) => [...row]),
    score,
    cleared,
    combo,
    bestCombo,
    juice,
    fever,
    lastMatch,
  };
}

test("import rejects stones that do not belong to the saved level", () => {
  const s = fixture();
  s.sessions.journey!.board = [
    [-1, -1, -1, -1],
    [-1, 1, -1, -1],
    [-1, -1, 1, -1],
    [-1, -1, -1, -1],
  ];
  s.sessions.journey!.total = 1;
  assert.throws(() => parseSave(JSON.stringify(s)));
});

test("a v1 save with corner and center gaps restores its original board", () => {
  const s = fixture();
  const game = s.sessions.journey!;
  game.level = 8;
  game.board = [
    [0, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 0],
  ];
  game.total = remaining(game.board);
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
});

test("legacy v1 layouts, new layouts, and undo/shuffle histories retain their original boards", () => {
  // The last journey level adds stones to the old full layout. The advanced
  // free and sprint presets both have stones, but only free uses gravity.
  const cases: { mode: Game["mode"]; level: Level; difficulty: number }[] = [
    { mode: "journey", level: LEVELS.at(-1)!, difficulty: 1 },
    { mode: "free", level: classicLevel("free", 2), difficulty: 2 },
    { mode: "sprint", level: classicLevel("sprint", 2), difficulty: 2 },
  ];
  for (const { mode, level, difficulty } of cases) {
    for (const legacy of [true, false]) {
      // The old generator did not simulate gravity when assigning fruit pairs.
      const layout = legacy ? { ...level, layout: undefined, gravity: false } : level;
      const board = generateBoard(layout, seedRandom(131));
      const s = fixture(),
        g = s.sessions.journey!;
      Object.assign(g, { mode, level: level.id, difficulty, board, total: remaining(board) });
      s.sessions = { [mode]: g };
      s.mode = mode;
      const label = `${mode}, level ${level.id}, legacy=${legacy}`;
      assert.deepEqual(parseSave(JSON.stringify(s)), s, label);

      g.history.push(snapshot(g));
      g.board = reshuffle(g.board, seedRandom(17));
      g.history.push(snapshot(g));
      g.board = removePair(g.board, findPairs(g.board, 1)[0], level.gravity);
      Object.assign(g, { cleared: 1, combo: 1, bestCombo: 1, score: 100, lastMatch: 300, juice: 12 });
      assert.deepEqual(parseSave(JSON.stringify(s)), s, label);

      const undone = g.history.pop()!;
      Object.assign(g, undone, { combo: 0, lastMatch: 0, assists: 1 });
      assert.deepEqual(parseSave(JSON.stringify(s)), s, label);
    }
  }
});

test("legacy pending clear and sprint timeout saves remain recoverable", () => {
  const s = fixture(),
    g = s.sessions.journey!;
  g.board = g.board.map((row) => row.map(() => 0));
  g.cleared = g.total;
  g.score = 800;
  g.bestCombo = 1;
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
  g.phase = "won";
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
  const b = makeLayout(classicLevel("sprint", 0));
  Object.assign(g, {
    mode: "sprint",
    difficulty: 0,
    phase: "lost",
    board: b,
    total: remaining(b),
    cleared: 0,
    bestCombo: 0,
    timeLeft: 0,
  });
  s.mode = "sprint";
  s.sessions = { sprint: g };
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
  g.phase = "playing"; // Pending timeout from an older controller is reconciled on restore.
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
});
test("import refuses malformed or incompatible files without coercing them", () => {
  assert.throws(() => parseSave("not json"));
  assert.throws(() => parseSave("{}"));
  for (const change of [
    (s: Save) => (s.stars[0] = 9),
    (s: Save) => (s.sessions.journey!.board[0][0] = 99),
    (s: Save) => (s.sessions.journey!.timeLeft = -1),
    (s: Save) => (s.sessions.journey!.seed = Infinity),
    (s: Save) => s.sessions.journey!.board.pop(),
  ]) {
    const s = fixture();
    change(s);
    assert.throws(() => parseSave(JSON.stringify(s)));
  }
});

test("legacy volume migrates and malformed volume is rejected", () => {
  const s = fixture();
  delete (s.settings as Partial<Save["settings"]>).volume;
  assert.equal(parseSave(JSON.stringify(s)).settings.volume, 0.8);
  for (const volume of [-1, 1.1, null, "loud"]) {
    (s.settings as any).volume = volume;
    assert.throws(() => parseSave(JSON.stringify(s)));
  }
});
