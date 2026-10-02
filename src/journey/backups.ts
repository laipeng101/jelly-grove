import backups from "./backups.json";
import { validatePuzzle } from "./rules";
import type { Puzzle, ThemeId } from "./types";
export function selectBackup(
  themeId: ThemeId,
  recent: string[],
  random = Math.random,
): Puzzle {
  const pool = (backups as Puzzle[]).filter(
    (p) => p.themeId === themeId && validatePuzzle(p),
  );
  const fresh = pool.filter((p) => !recent.slice(-20).includes(p.id));
  const available = fresh.length ? fresh : pool;
  if (!available.length)
    throw new Error("没有通过验证的备用棋局，请重新载入完整离线包。");
  return structuredClone(available[Math.floor(random() * available.length)]);
}
