export type Point = { r: number; c: number };
export type Board = number[][]; // 0 = empty, -1 = stone, 1..10 = fruit
export type Pair = { a: Point; b: Point; path: Point[] };
export type Level = {
  id: number;
  name: string;
  rows: number;
  cols: number;
  kinds: number;
  chapter: number;
  gravity: boolean;
  pattern: "full" | "gaps" | "stones";
  target: number;
  /** Explicit coordinates travel with a copied level, independently of its id. */
  layout?: { gaps?: Point[]; stones?: Point[] };
};
export const CHAPTERS = [
  {
    name: "初见果园",
    label: "THE FIRST SPROUT",
    description: "从一对水果，开始一点小快乐。",
    color: "#7b9f71",
  },
  {
    name: "阳光小径",
    label: "A LITTLE SUNSHINE",
    description: "留白也是路，试试从外面绕过去。",
    color: "#c29c55",
  },
  {
    name: "石间花语",
    label: "BETWEEN THE STONES",
    description: "绕过小石头，总会有新的相遇。",
    color: "#9c8fba",
  },
  {
    name: "流动盛夏",
    label: "SUMMER IN MOTION",
    description: "水果向下落，灵感向上冒。",
    color: "#cf877b",
  },
];
const names = [
  "第一口甜",
  "小小相遇",
  "叶间阳光",
  "莓好时光",
  "青柠微风",
  "果园来信",
  "曲径通甜",
  "留一点空",
  "绕个小弯",
  "柑橘午后",
  "藏在转角",
  "晴日漫游",
  "石头开花",
  "薄荷石径",
  "好事多磨",
  "葡萄密语",
  "相逢有路",
  "月光花园",
  "轻轻落下",
  "满杯鲜活",
  "流动灵感",
  "仲夏果梦",
  "甜蜜涟漪",
  "整个夏天",
];
const points = (...cells: [number, number][]): Point[] =>
  cells.map(([r, c]) => ({ r, c }));
const layouts: NonNullable<Level["layout"]>[] = [
  {},
  {},
  {},
  { gaps: points([0, 0], [5, 5]) },
  { gaps: points([0, 0], [0, 5], [5, 0], [5, 5]) },
  { gaps: points([0, 0], [5, 5], [2, 2], [2, 3], [3, 2], [3, 3]) },
  { gaps: points([2, 2], [2, 3], [5, 2], [5, 3]) },
  {
    gaps: points(
      [0, 0],
      [0, 5],
      [7, 0],
      [7, 5],
      [2, 2],
      [2, 3],
      [5, 2],
      [5, 3],
    ),
  },
  {
    gaps: points(
      [1, 2],
      [1, 3],
      [2, 2],
      [2, 3],
      [5, 2],
      [5, 3],
      [6, 2],
      [6, 3],
    ),
  },
  { gaps: points([1, 1], [2, 4], [3, 2], [4, 3], [5, 1], [6, 4]) },
  {
    gaps: points(
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
    ),
  },
  {
    gaps: points(
      [0, 0],
      [0, 5],
      [7, 0],
      [7, 5],
      [2, 2],
      [2, 3],
      [5, 2],
      [5, 3],
      [3, 1],
      [3, 4],
      [4, 1],
      [4, 4],
    ),
  },
  { stones: points([2, 2], [2, 3], [5, 2], [5, 3]) },
  { stones: points([2, 1], [2, 4], [5, 1], [5, 4]) },
  { stones: points([3, 1], [3, 2], [3, 3], [3, 4]) },
  { stones: points([2, 1], [2, 2], [5, 3], [5, 4]) },
  { stones: points([1, 1], [1, 4], [6, 1], [6, 4]) },
  { stones: points([2, 2], [3, 2], [4, 2], [5, 2]) },
  {},
  { gaps: points([0, 0], [0, 5], [7, 0], [7, 5]) },
  { gaps: points([0, 0], [0, 1], [0, 4], [0, 5], [1, 0], [1, 5]) },
  { stones: points([3, 1], [3, 4]), gaps: points([0, 0], [0, 5]) },
  {
    stones: points([2, 1], [2, 4], [5, 1], [5, 4]),
    gaps: points([0, 0], [0, 5]),
  },
  {
    stones: points([2, 2], [2, 3], [5, 2], [5, 3]),
    gaps: points([0, 0], [0, 5], [7, 0], [7, 5]),
  },
];
export const LEVELS: Level[] = names.map((name, i) => ({
  id: i + 1,
  name,
  rows: i < 2 ? 4 : i < 6 ? 6 : 8,
  cols: i === 0 ? 4 : 6,
  kinds:
    i >= 18
      ? [7, 8, 8, 9, 9, 10][i - 18]
      : i === 5
        ? 6
        : Math.min(10, 4 + Math.floor(i / 3)),
  chapter: Math.floor(i / 6),
  gravity: i >= 18,
  pattern: i >= 12 && i < 18 ? "stones" : i >= 6 && i < 12 ? "gaps" : "full",
  target:
    i >= 18
      ? [5, 6, 6, 7, 7, 8][i - 18]
      : i < 2
        ? 3
        : i < 4
          ? 4
          : i < 12
            ? 5
            : 6,
  layout: layouts[i],
}));
export function clone(board: Board): Board {
  return board.map((row) => [...row]);
}
export function same(a: Point, b: Point) {
  return a.r === b.r && a.c === b.c;
}
export function remaining(board: Board) {
  return board.flat().filter((v) => v > 0).length / 2;
}
function compress(points: Point[]): Point[] {
  return points.filter(
    (p, i) =>
      i === 0 ||
      i === points.length - 1 ||
      (points[i - 1].r === p.r) !== (p.r === points[i + 1].r),
  );
}
/** Enumerate straight, L, and two-turn routes, including the one-cell outer border. */
export function findPath(board: Board, a: Point, b: Point): Point[] | null {
  const h = board.length,
    w = board[0]?.length || 0;
  if (
    !h ||
    same(a, b) ||
    a.r < 0 ||
    a.c < 0 ||
    b.r < 0 ||
    b.c < 0 ||
    a.r >= h ||
    b.r >= h ||
    a.c >= w ||
    b.c >= w ||
    board[a.r][a.c] <= 0 ||
    board[a.r][a.c] !== board[b.r][b.c]
  )
    return null;
  const free = (p: Point) =>
    p.r >= -1 &&
    p.r <= h &&
    p.c >= -1 &&
    p.c <= w &&
    (same(p, a) ||
      same(p, b) ||
      p.r === -1 ||
      p.r === h ||
      p.c === -1 ||
      p.c === w ||
      board[p.r][p.c] === 0);
  const line = (p: Point, q: Point) => {
    if (p.r !== q.r && p.c !== q.c) return false;
    const dr = Math.sign(q.r - p.r),
      dc = Math.sign(q.c - p.c);
    let r = p.r,
      c = p.c;
    for (;;) {
      if (!free({ r, c })) return false;
      if (r === q.r && c === q.c) return true;
      r += dr;
      c += dc;
    }
  };
  const valid = (route: Point[]) => {
    const compact = route.filter((p, i) => !i || !same(p, route[i - 1]));
    for (let i = 1; i < compact.length; i++)
      if (!line(compact[i - 1], compact[i])) return null;
    // An endpoint may not be used as an interior pivot or traversed before the end.
    for (let i = 0; i < compact.length - 1; i++) {
      const p = compact[i],
        q = compact[i + 1];
      for (const endpoint of [a, b]) {
        const on =
          (p.r === q.r &&
            endpoint.r === p.r &&
            endpoint.c >= Math.min(p.c, q.c) &&
            endpoint.c <= Math.max(p.c, q.c)) ||
          (p.c === q.c &&
            endpoint.c === p.c &&
            endpoint.r >= Math.min(p.r, q.r) &&
            endpoint.r <= Math.max(p.r, q.r));
        if (
          on &&
          !(same(endpoint, a) && i === 0) &&
          !(same(endpoint, b) && i === compact.length - 2)
        )
          return null;
      }
    }
    return compress(compact);
  };
  if (a.r === b.r || a.c === b.c) {
    const p = valid([a, b]);
    if (p) return p;
  }
  for (const bend of [
    { r: a.r, c: b.c },
    { r: b.r, c: a.c },
  ]) {
    const p = valid([a, bend, b]);
    if (p) return p;
  }
  const candidates: Point[][] = [];
  for (let r = -1; r <= h; r++) {
    const p = valid([a, { r, c: a.c }, { r, c: b.c }, b]);
    if (p) candidates.push(p);
  }
  for (let c = -1; c <= w; c++) {
    const p = valid([a, { r: a.r, c }, { r: b.r, c }, b]);
    if (p) candidates.push(p);
  }
  const length = (p: Point[]) =>
    p
      .slice(1)
      .reduce(
        (n, q, i) => n + Math.abs(q.r - p[i].r) + Math.abs(q.c - p[i].c),
        0,
      );
  return candidates.sort((x, y) => length(x) - length(y))[0] || null;
}
export function findPairs(board: Board, limit = Infinity): Pair[] {
  const groups = new Map<number, Point[]>(),
    result: Pair[] = [];
  board.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > 0) groups.set(v, [...(groups.get(v) || []), { r, c }]);
    }),
  );
  for (const group of groups.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const path = findPath(board, group[i], group[j]);
        if (path) {
          result.push({ a: group[i], b: group[j], path });
          if (result.length >= limit) return result;
        }
      }
  return result;
}
export function seedRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function makeLayout(level: Level): Board {
  const b: Board = Array.from({ length: level.rows }, () =>
    Array(level.cols).fill(1),
  );
  if (level.layout) {
    for (const p of level.layout.gaps || []) b[p.r][p.c] = 0;
    for (const p of level.layout.stones || []) b[p.r][p.c] = -1;
  } else if (level.pattern !== "full") {
    const value = level.pattern === "stones" ? -1 : 0;
    for (const r of [2, level.rows - 3])
      for (const c of [2, 3]) b[r][c] = value;
    if (level.pattern === "gaps" && level.id % 2 === 0) {
      b[0][0] = 0;
      b[0][level.cols - 1] = 0;
      b[level.rows - 1][0] = 0;
      b[level.rows - 1][level.cols - 1] = 0;
    }
  }
  return b;
}
/** Build a removal schedule on a template, then color each original pair.
 * This gives a constructive solution, instead of assuming a random shuffle is solvable.
 * Original cell identities fall with the schedule on gravity levels.
 */
export function generateBoard(level: Level, rng = Math.random): Board {
  const template = makeLayout(level),
    result = clone(template);
  let work = clone(template),
    identities = template.map((row, r) =>
      row.map((v, c) => (v > 0 ? r * level.cols + c + 1 : v)),
    );
  const palette = shuffle(
    Array.from({ length: 10 }, (_, i) => i + 1),
    rng,
  ).slice(0, level.kinds);
  let pairIndex = 0;
  while (remaining(work) > 0) {
    const pairs = findPairs(work);
    if (!pairs.length) throw new Error("Layout cannot be paired");
    const { a, b } = pairs[Math.floor(rng() * pairs.length)];
    const fruit = palette[pairIndex++ % palette.length];
    for (const p of [a, b]) {
      const id = identities[p.r][p.c] - 1;
      result[Math.floor(id / level.cols)][id % level.cols] = fruit;
      identities[p.r][p.c] = 0;
    }
    work = removePair(work, { a, b }, level.gravity);
    if (level.gravity) identities = applyGravity(identities);
  }
  return result;
}

/** Ignore fruit colors and check that an entire geometric removal order exists.
 * Used before accepting a restored layout; a single available pair is insufficient.
 */
export function canClearGeometry(board: Board, gravity = false): boolean {
  const dead = new Set<string>();
  const visit = (shape: Board): boolean => {
    if (!remaining(shape)) return true;
    const key = shape.map((row) => row.join(",")).join(";");
    if (dead.has(key)) return false;
    for (const pair of findPairs(shape)) {
      if (visit(removePair(shape, pair, gravity))) return true;
    }
    dead.add(key);
    return false;
  };
  return visit(board.map((row) => row.map((v) => (v > 0 ? 1 : v))));
}
export function applyGravity(board: Board): Board {
  const b = clone(board),
    h = b.length,
    w = b[0].length;
  for (let c = 0; c < w; c++) {
    let bottom = h - 1;
    for (let r = h - 1; r >= -1; r--)
      if (r === -1 || b[r][c] === -1) {
        const values: number[] = [];
        for (let j = bottom; j > r; j--) if (b[j][c] > 0) values.push(b[j][c]);
        for (let j = bottom; j > r; j--) b[j][c] = values[bottom - j] || 0;
        bottom = r - 1;
      }
  }
  return b;
}
export function removePair(
  board: Board,
  pair: Pick<Pair, "a" | "b">,
  gravity = false,
): Board {
  if (!findPath(board, pair.a, pair.b)) throw new Error("Invalid pair");
  const b = clone(board);
  b[pair.a.r][pair.a.c] = b[pair.b.r][pair.b.c] = 0;
  return gravity ? applyGravity(b) : b;
}
/** Preserve the exact fruit multiset and stones. If shuffling cannot find a move,
 * distribute paired values along a proven geometric removal schedule. */
export function reshuffle(board: Board, rng = Math.random): Board {
  const cells: Point[] = [],
    values: number[] = [];
  board.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > 0) {
        cells.push({ r, c });
        values.push(v);
      }
    }),
  );
  if (!cells.length) return clone(board);
  for (let attempt = 0; attempt < 80; attempt++) {
    const b = clone(board),
      shuffled = shuffle(values, rng);
    cells.forEach((p, i) => {
      b[p.r][p.c] = shuffled[i];
    });
    if (findPairs(b, 1).length) return b;
  }
  const b = clone(board),
    shape = clone(board);
  cells.forEach((p) => {
    shape[p.r][p.c] = 1;
  });
  const pair = findPairs(shape, 1)[0];
  if (!pair) throw new Error("No geometrically accessible pair");
  const fruit = values.find((v) => values.filter((x) => x === v).length >= 2)!;
  const rest = [...values];
  rest.splice(rest.indexOf(fruit), 1);
  rest.splice(rest.indexOf(fruit), 1);
  b[pair.a.r][pair.a.c] = b[pair.b.r][pair.b.c] = fruit;
  cells
    .filter((p) => !same(p, pair.a) && !same(p, pair.b))
    .forEach((p, i) => {
      b[p.r][p.c] = rest[i];
    });
  return b;
}
