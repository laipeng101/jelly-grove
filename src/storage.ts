import {
  LEVELS,
  makeLayout,
  remaining,
  canClearGeometry,
  type Board,
} from "./engine";
export type Mode = "journey" | "free" | "sprint";
export type Snapshot = {
  board: Board;
  score: number;
  cleared: number;
  combo: number;
  bestCombo: number;
  juice: number;
  fever: number;
  lastMatch: number;
};
export type Game = Snapshot & {
  mode: Mode;
  level: number;
  difficulty: number;
  total: number;
  assists: number;
  elapsed: number;
  timeLeft: number;
  round: number;
  phase: "playing" | "won" | "lost";
  history: Snapshot[];
  seed: number;
};
export type Save = {
  version: 1;
  mode: Mode;
  stars: number[];
  best: number;
  freeBest: number;
  totalPairs: number;
  settings: { sound: boolean; motion: boolean };
  sessions: Partial<Record<Mode, Game>>;
};
const KEY = "jelly-grove.save.v1";
export function emptySave(): Save {
  return {
    version: 1,
    mode: "journey",
    stars: Array(24).fill(0),
    best: 0,
    freeBest: 0,
    totalPairs: 0,
    settings: {
      sound: true,
      motion: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    sessions: {},
  };
}
const numeric = (
  v: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (
  v: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): v is number => numeric(v, min, max) && Number.isSafeInteger(v);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const snapshotKeys = [
  "board",
  "score",
  "cleared",
  "combo",
  "bestCombo",
  "juice",
  "fever",
  "lastMatch",
];
const gameKeys = [
  ...snapshotKeys,
  "mode",
  "level",
  "difficulty",
  "total",
  "assists",
  "elapsed",
  "timeLeft",
  "round",
  "phase",
  "history",
  "seed",
];
function validBoard(b: unknown): b is Board {
  return (
    Array.isArray(b) &&
    b.length >= 4 &&
    b.length <= 8 &&
    b.every(
      (row) =>
        Array.isArray(row) &&
        row.length === b[0].length &&
        row.length >= 4 &&
        row.length <= 6 &&
        row.every((v) => Number.isInteger(v) && v >= -1 && v <= 10),
    ) &&
    Array.from({ length: 10 }, (_, i) => i + 1).every(
      (v) => b.flat().filter((x) => x === v).length % 2 === 0,
    )
  );
}
function validSnapshot(s: Snapshot): boolean {
  return (
    record(s) &&
    validBoard(s.board) &&
    ["score", "cleared", "combo", "bestCombo"].every((k) =>
      integer(s[k as keyof Snapshot]),
    ) &&
    s.combo <= s.bestCombo &&
    s.bestCombo <= s.cleared &&
    numeric(s.juice, 0, 100) &&
    numeric(s.fever, 0, 10000) &&
    numeric(s.lastMatch)
  );
}
function validGame(g: Game, mode: Mode): boolean {
  if (
    !record(g) ||
    !Object.keys(g).every((k) => gameKeys.includes(k)) ||
    !validSnapshot(g) ||
    g.mode !== mode ||
    !Number.isInteger(g.level) ||
    g.level < 1 ||
    g.level > 24 ||
    !Number.isInteger(g.difficulty) ||
    g.difficulty < 0 ||
    g.difficulty > 2 ||
    !["playing", "won", "lost"].includes(g.phase) ||
    !Array.isArray(g.history) ||
    g.history.length > 20 ||
    !g.history.every(
      (s) =>
        validSnapshot(s) &&
        Object.keys(s).every((k) => snapshotKeys.includes(k)),
    )
  )
    return false;
  if (
    !integer(g.total, 1) ||
    !integer(g.assists) ||
    !integer(g.round, 1) ||
    !integer(g.seed, 0, 0xffffffff) ||
    !numeric(g.elapsed) ||
    !numeric(g.timeLeft, 0, 120000)
  )
    return false;
  const l =
    mode === "journey"
      ? LEVELS[g.level - 1]
      : {
          ...LEVELS[g.difficulty === 0 ? 2 : g.difficulty === 1 ? 7 : 16],
          id: 1,
        };
  if (g.board.length !== l.rows || g.board[0].length !== l.cols) return false;
  const stones = (b: Board) =>
    b
      .flat()
      .map((v) => (v === -1 ? "#" : "."))
      .join("");
  const stoneMask = stones(g.board);
  // Existing v1 games keep their original obstacles even when a level's design changes.
  const allowedStones = [
    makeLayout(l),
    makeLayout({ ...l, layout: undefined }),
  ].map(stones);
  if (!allowedStones.includes(stoneMask)) return false;
  if (g.cleared + remaining(g.board) !== g.total) return false;
  if (
    mode !== "sprint" &&
    g.total >
      (l.rows * l.cols - g.board.flat().filter((v) => v === -1).length) / 2
  )
    return false;
  if (g.phase === "won" && (mode === "sprint" || remaining(g.board) !== 0))
    return false;
  if (g.phase === "lost" && (mode !== "sprint" || g.timeLeft !== 0))
    return false;
  // A playing empty board is a legitimate v1 save made during its final animation.
  // The controller reconciles pending completion or timeout after restore.
  const gravity =
    mode === "journey" ? l.gravity : mode === "free" && g.difficulty === 2;
  const geometryCache = new Map<string, boolean>();
  const validState = (s: Snapshot) => {
    if (
      s.board.length !== l.rows ||
      s.board[0].length !== l.cols ||
      stones(s.board) !== stoneMask ||
      s.cleared + remaining(s.board) !== g.total ||
      s.cleared > g.cleared ||
      s.lastMatch > g.elapsed
    )
      return false;
    const key = s.board
      .flat()
      .map((v) => (v > 0 ? 1 : v))
      .join(",");
    if (!geometryCache.has(key))
      geometryCache.set(key, canClearGeometry(s.board, gravity));
    return geometryCache.get(key)!;
  };
  if (!validState(g) || !g.history.every(validState)) return false;
  if (g.history.some((s, i) => i > 0 && s.cleared < g.history[i - 1].cleared))
    return false;
  return true;
}
export function parseSave(raw: string): Save {
  const s = JSON.parse(raw) as Save;
  if (
    !record(s) ||
    s.version !== 1 ||
    !["journey", "free", "sprint"].includes(s.mode) ||
    !Array.isArray(s.stars) ||
    s.stars.length !== 24 ||
    !s.stars.every((v) => Number.isInteger(v) && v >= 0 && v <= 3) ||
    !integer(s.best) ||
    !integer(s.freeBest) ||
    !integer(s.totalPairs) ||
    !record(s.settings) ||
    typeof s.settings.sound !== "boolean" ||
    typeof s.settings.motion !== "boolean" ||
    !record(s.sessions) ||
    !Object.keys(s.sessions).every((k) =>
      ["journey", "free", "sprint"].includes(k),
    )
  )
    throw new Error("这份存档不属于果冻果园，或内容已经损坏。");
  for (const mode of ["journey", "free", "sprint"] as Mode[])
    if (Object.hasOwn(s.sessions, mode) && !validGame(s.sessions[mode]!, mode))
      throw new Error("棋局数据不完整，无法恢复这份存档。");
  return s;
}
export function loadSave(): { save: Save; warning: string | null } {
  try {
    const raw = localStorage.getItem(KEY);
    return { save: raw ? parseSave(raw) : emptySave(), warning: null };
  } catch {
    return {
      save: emptySave(),
      warning: "未能读取存档，这一局可以正常游玩。你可以在设置中导出新进度。",
    };
  }
}
export function writeSave(s: Save): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
