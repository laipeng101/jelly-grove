import test from "node:test";
import assert from "node:assert/strict";
import { parseSave, type Save, type Game } from "../src/storage.ts";
import {
  generateBoard,
  LEVELS,
  remaining,
  findPairs,
  removePair,
  seedRandom,
  type Level,
} from "../src/engine.ts";
function fixture(): Save {
  const g: Game = {
    mode: "journey",
    level: 1,
    difficulty: 1,
    seed: 4_000_000_000,
    board: generateBoard(LEVELS[0]),
    score: 0,
    cleared: 0,
    total: 8,
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

test("invalid obstacles and unrepairable stone pockets cannot replace a save", () => {
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

test("legacy v1 layouts, new layouts, and undo/shuffle histories retain their original boards", () => {
  for (const mode of ["journey", "free", "sprint"] as const) {
    const cases =
      mode === "journey"
        ? LEVELS.map((l) => ({ l, difficulty: 1 }))
        : [0, 1, 2].map((difficulty) => ({
            l: LEVELS[[2, 7, 16][difficulty]],
            difficulty,
          }));
    for (const { l, difficulty } of cases)
      for (const legacy of [true, false]) {
        const level: Level = {
          ...l,
          id: mode === "journey" ? l.id : 1,
          gravity:
            mode === "journey"
              ? l.gravity
              : mode === "free" && difficulty === 2,
        };
        if (legacy) delete level.layout;
        // v1 generation did not simulate gravity; this still describes a legal v1 starting board.
        const board = generateBoard(
          legacy ? { ...level, gravity: false } : level,
          seedRandom(131),
        );
        const s = fixture(),
          g = s.sessions.journey!;
        Object.assign(g, {
          mode,
          level: level.id,
          difficulty,
          board,
          total: remaining(board),
        });
        delete s.sessions.journey;
        s.sessions[mode] = g;
        s.mode = mode;
        assert.deepEqual(
          parseSave(JSON.stringify(s)),
          s,
          `${mode}, level ${l.id}, legacy=${legacy}`,
        );
        // A shuffle snapshot may have the same cleared count as its neighbor.
        g.history.push(snapshot(g), snapshot(g));
        const pair = findPairs(g.board, 1)[0];
        g.board = removePair(g.board, pair, level.gravity);
        g.cleared = 1;
        g.combo = 1;
        g.bestCombo = 1;
        g.score = 100;
        g.lastMatch = 300;
        g.juice = 12;
        assert.deepEqual(parseSave(JSON.stringify(s)), s);
        const undone = g.history.pop()!;
        Object.assign(g, undone, { combo: 0, lastMatch: 0 });
        g.assists++;
        assert.deepEqual(parseSave(JSON.stringify(s)), s);
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
  const b = generateBoard({ ...LEVELS[2], id: 1 }, seedRandom(2));
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
