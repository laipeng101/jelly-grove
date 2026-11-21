import backups from "./generated/backups.json";
import { validatePuzzle } from "./rules";
import { RECENT_PUZZLE_LIMIT, type Puzzle, type ThemeId } from "./types";
export function selectBackup(
  themeId: ThemeId,
  recent: string[],
  random = Math.random,
): Puzzle {
  const pool = (backups as Puzzle[]).filter(
    (p) => p.themeId === themeId && validatePuzzle(p),
  );
  const recentIds = new Set(recent.slice(0, RECENT_PUZZLE_LIMIT));
  const fresh = pool.filter((p) => !recentIds.has(p.id));
  const available = fresh.length ? fresh : pool;
  if (!available.length)
    throw new Error("没有通过验证的备用棋局，请重新载入完整离线包。");
  return structuredClone(available[Math.floor(random() * available.length)]);
}
