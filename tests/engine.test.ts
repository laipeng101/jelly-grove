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
} from "../src/engine.ts";

// Independent direction-state BFS checks the route enumerator against the actual rules.
function oracle(b: Board, a: Point, z: Point): boolean {
  if (
    (a.r === z.r && a.c === z.c) ||
    b[a.r][a.c] <= 0 ||
    b[a.r][a.c] !== b[z.r][z.c]
  )
    return false;
  const h = b.length,
    w = b[0].length,
    dirs = [
      [-1, 0],
      [0, 1],
      [1, 0],
      [0, -1],
    ],
    q: { r: number; c: number; d: number; t: number }[] = [],
    seen = new Map<string, number>();
  for (let d = 0; d < 4; d++) q.push({ ...a, d, t: 0 });
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    for (let d = 0; d < 4; d++) {
      const t = cur.t + (cur.d === d ? 0 : 1);
      if (t > 2) continue;
      const r = cur.r + dirs[d][0],
        c = cur.c + dirs[d][1];
      if (r < -1 || r > h || c < -1 || c > w) continue;
      if (r === z.r && c === z.c) return true;
      if (r >= 0 && r < h && c >= 0 && c < w && b[r][c] !== 0) continue;
      const key = `${r},${c},${d}`;
      if ((seen.get(key) ?? 3) <= t) continue;
      seen.set(key, t);
      q.push({ r, c, d, t });
    }
  }
  return false;
}
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
        assert.equal(!!path, oracle(b, a, z), JSON.stringify({ b, a, z }));
        if (path) assert.ok(path.length <= 4);
      }
  }
});
test("all 24 levels produce complete playable boards; legal moves and free repairs reach completion", () => {
  for (const level of LEVELS)
    for (let seed = 1; seed <= 12; seed++) {
      let b = generateBoard(level, seedRandom(seed)),
        count = remaining(b),
        moves = 0,
        repairs = 0;
      assert.ok(count > 0);
      assert.ok(findPairs(b, 1).length > 0);
      for (let v = 1; v <= 10; v++)
        assert.equal(b.flat().filter((x) => x === v).length % 2, 0);
      while (remaining(b)) {
        let pair = findPairs(b, 1)[0];
        if (!pair) {
          b = reshuffle(b, seedRandom(seed + repairs++));
          pair = findPairs(b, 1)[0];
        }
        assert.ok(pair);
        b = removePair(b, pair, level.gravity);
        moves++;
        assert.equal(remaining(b), count - moves);
        assert.ok(moves <= count);
      }
      assert.equal(moves, count);
    }
});

test("constructive removal witnesses work with gravity for every generated level", () => {
  for (const level of LEVELS)
    for (let seed = 1; seed <= 6; seed++) {
      let b = generateBoard(level, seedRandom(seed)),
        shape = makeLayout(level);
      const scheduleRng = seedRandom(seed);
      // The generator first shuffles the ten-fruit palette.
      for (let i = 0; i < 9; i++) scheduleRng();
      while (remaining(shape)) {
        const pairs = findPairs(shape),
          pair = pairs[Math.floor(scheduleRng() * pairs.length)];
        assert.ok(
          pair,
          `geometric schedule exists for level ${level.id}, seed ${seed}`,
        );
        assert.ok(
          findPath(b, pair.a, pair.b),
          `colored pair follows the same falling schedule for level ${level.id}`,
        );
        b = removePair(b, pair, level.gravity);
        shape = removePair(shape, pair, level.gravity);
      }
      assert.equal(remaining(b), 0);
    }
});

test("level layouts survive mode id changes and late levels offer distinct mechanics", () => {
  for (const level of LEVELS) {
    assert.deepEqual(makeLayout({ ...level, id: 1 }), makeLayout(level));
    assert.ok(canClearGeometry(makeLayout(level), level.gravity));
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
