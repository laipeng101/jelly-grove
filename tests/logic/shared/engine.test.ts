import test from "node:test";
import assert from "node:assert/strict";
import {
  findPath,
  findPairs,
  generateBoard,
  LEVELS,
  removePair,
  reshuffle,
  remaining,
  seedRandom,
  applyGravity,
  makeLayout,
  canClearGeometry,
  type Board,
  type Point,
} from "../../../src/engine.ts";
import { hasTwoTurnPath } from "../../path-oracle";

test("routes: straight, one bend, two bends, outer border, occupied blockage", () => {
  assert.equal(findPath([[1, 1]], { r: 0, c: 0 }, { r: 0, c: 1 })?.length, 2);
  assert.equal(
    findPath(
      [
        [1, 0],
        [0, 1],
      ],
      { r: 0, c: 0 },
      { r: 1, c: 1 },
    )?.length,
    3,
  );
  const outer = findPath(
    [
      [1, 2, 1],
      [2, 2, 2],
    ],
    { r: 0, c: 0 },
    { r: 0, c: 2 },
  );
  assert.ok(outer?.some((p) => p.r === -1));
  assert.equal(outer?.length, 4);
  assert.equal(
    findPath(
      [
        [-1, -1, -1, -1],
        [-1, 1, 2, -1],
        [-1, 2, 1, -1],
        [-1, -1, -1, -1],
      ],
      { r: 1, c: 1 },
      { r: 2, c: 2 },
    ),
    null,
  );
  assert.equal(findPath([[1, 2]], { r: 0, c: 0 }, { r: 0, c: 1 }), null);
  assert.equal(findPath([[1]], { r: 0, c: 0 }, { r: 0, c: 0 }), null);
});
test("route algorithm agrees with BFS on 100 random boards and all occupied pairs", () => {
  const rng = seedRandom(73051);
  for (let n = 0; n < 100; n++) {
    const b = Array.from({ length: 4 }, () =>
      Array.from({ length: 5 }, () => {
        const v = Math.floor(rng() * 5);
        return v === 4 ? -1 : v;
      }),
    );
    const cells: Point[] = [];
    b.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v > 0) cells.push({ r, c });
      }),
    );
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i],
          z = cells[j],
          path = findPath(b, a, z);
        assert.equal(!!path, hasTwoTurnPath(b, a, z), JSON.stringify({ b, a, z }));
        if (path) assert.ok(path.length <= 4);
      }
  }
});
test("all 24 levels produce complete playable boards; legal moves and free repairs reach completion", () => {
  for (const level of LEVELS) {
    const rng = seedRandom(level.id);
    let board = generateBoard(level, rng);
    const pairs = remaining(board);
    assert.ok(pairs > 0, `level ${level.id}`);
    assert.ok(findPairs(board, 1).length, `starting move at level ${level.id}`);
    for (let left = pairs; left > 0; left--) {
      let pair = findPairs(board, 1)[0];
      if (!pair) {
        board = reshuffle(board, rng);
        pair = findPairs(board, 1)[0];
      }
      assert.ok(pair, `level ${level.id}, ${left} pairs left`);
      board = removePair(board, pair, level.gravity);
      assert.equal(remaining(board), left - 1, `level ${level.id}`);
    }
  }
});

test("a generated board clears without shuffling along its geometric removal order", () => {
  const cases = LEVELS.map((level) => ({ level, choice: 0 }));
  // Also exercise a non-first choice on a board with stones and gravity.
  cases.push({ level: LEVELS.at(-1)!, choice: 0.5 });
  for (const { level, choice } of cases) {
    let board = generateBoard(level, () => choice);
    let shape = makeLayout(level);
    while (remaining(shape)) {
      const pairs = findPairs(shape);
      const pair = pairs[Math.floor(choice * pairs.length)];
      assert.ok(pair, `geometric schedule at level ${level.id}`);
      assert.ok(findPath(board, pair.a, pair.b), `generated fruit at level ${level.id}`);
      board = removePair(board, pair, level.gravity);
      shape = removePair(shape, pair, level.gravity);
    }
    assert.equal(remaining(board), 0, `level ${level.id}`);
  }
});

test("level layouts survive mode id changes and late levels offer distinct mechanics", () => {
  for (const level of LEVELS) {
    assert.deepEqual(makeLayout({ ...level, id: 1 }), makeLayout(level));
  }
  assert.equal(
    new Set(
      LEVELS.slice(18).map((l) =>
        JSON.stringify([makeLayout(l), l.kinds, l.target]),
      ),
    ).size,
    6,
  );
  assert.equal(
    new Set(
      LEVELS.map((l) =>
        JSON.stringify([makeLayout(l), l.kinds, l.gravity, l.target]),
      ),
    ).size,
    24,
  );
});

test("geometric clearance rejects enclosed fruit pockets even when colors are paired", () => {
  assert.equal(
    canClearGeometry([
      [-1, -1, -1, -1],
      [-1, 1, -1, -1],
      [-1, -1, 1, -1],
      [-1, -1, -1, -1],
    ]),
    false,
  );
  assert.equal(
    canClearGeometry([
      [1, 2, 1, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]),
    true,
  );
});

test("stone layouts never strand the final pair, regardless of earlier match order", () => {
  for (const level of LEVELS) {
    const b: Board = makeLayout(level).map((row) =>
      row.map((v) => (v === -1 ? -1 : 0)),
    );
    const cells = b.flatMap((row, r) =>
      row.flatMap((v, c) => (v === -1 ? [] : [{ r, c }])),
    );
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i],
          z = cells[j];
        b[a.r][a.c] = b[z.r][z.c] = 1;
        assert.ok(
          findPath(b, a, z),
          `level ${level.id}: ${JSON.stringify([a, z])}`,
        );
        b[a.r][a.c] = b[z.r][z.c] = 0;
      }
  }
});
test("shuffle preserves fruits and fixed obstacles and creates an available match", () => {
  const b = [
    [1, 2, 1, 2],
    [2, -1, -1, 1],
    [1, 2, 0, 0],
    [3, 4, 3, 4],
  ];
  const out = reshuffle(b, seedRandom(81));
  assert.deepEqual(out.flat().sort(), b.flat().sort());
  assert.equal(out[1][1], -1);
  assert.equal(out[1][2], -1);
  assert.equal(out[2][2], 0);
  assert.ok(findPairs(out, 1).length);
  assert.deepEqual(b, [
    [1, 2, 1, 2],
    [2, -1, -1, 1],
    [1, 2, 0, 0],
    [3, 4, 3, 4],
  ]);
});
test("gravity compacts independently above and below stones and preserves order", () => {
  const b = [
    [1, 0],
    [0, 2],
    [-1, 0],
    [3, 4],
    [0, 0],
    [5, 6],
  ];
  assert.deepEqual(applyGravity(b), [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 2],
    [3, 4],
    [5, 6],
  ]);
});
test("seeded boards are reproducible and illegal matches cannot mutate state", () => {
  assert.deepEqual(
    generateBoard(LEVELS[7], seedRandom(7)),
    generateBoard(LEVELS[7], seedRandom(7)),
  );
  const b = [
    [1, 2],
    [2, 1],
  ];
  assert.throws(() => removePair(b, { a: { r: 0, c: 0 }, b: { r: 0, c: 1 } }));
  assert.deepEqual(b, [
    [1, 2],
    [2, 1],
  ]);
});
