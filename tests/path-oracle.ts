import type { Board, Point } from "../src/engine";

/** Independent directional BFS, deliberately not the production path enumerator. */
export function hasTwoTurnPath(board: Board, a: Point, b: Point): boolean {
  if (
    board[a.r][a.c] <= 0 ||
    board[a.r][a.c] !== board[b.r][b.c] ||
    (a.r === b.r && a.c === b.c)
  )
    return false;
  const h = board.length,
    w = board[0].length,
    dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ],
    seen = new Map<string, number>();
  const queue = dirs.map((_, dir) => ({ r: a.r, c: a.c, dir, turns: 0 }));
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    for (let dir = 0; dir < 4; dir++) {
      const turns = q.turns + (q.dir === dir ? 0 : 1);
      if (turns > 2) continue;
      const r = q.r + dirs[dir][0],
        c = q.c + dirs[dir][1];
      if (r < -1 || r > h || c < -1 || c > w) continue;
      if (r === b.r && c === b.c) return true;
      if (r >= 0 && r < h && c >= 0 && c < w && board[r][c] !== 0) continue;
      const key = `${r},${c},${dir}`;
      if ((seen.get(key) ?? Infinity) <= turns) continue;
      seen.set(key, turns);
      queue.push({ r, c, dir, turns });
    }
  }
  return false;
}
