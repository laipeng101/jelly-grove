import type { Level } from "./engine";

/** Stable practice/sprint presets. New journey content must never mutate these. */
export function classicLevel(
  mode: "free" | "sprint",
  difficulty: number,
  id = 1,
): Level {
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 2)
    throw new Error("Unknown classic difficulty");
  const cells = (items: number[][]) => items.map(([r, c]) => ({ r, c }));
  return {
    id,
    name:
      mode === "sprint"
        ? "120 秒，鲜榨快乐"
        : ["轻松一盘", "刚刚好的挑战", "高手的果园"][difficulty],
    rows: difficulty === 0 ? 6 : 8,
    cols: 6,
    kinds: [4, 6, 9][difficulty],
    chapter: difficulty,
    gravity: mode === "free" && difficulty === 2,
    pattern: (["full", "gaps", "stones"] as const)[difficulty],
    target: [4, 5, 6][difficulty],
    layout:
      difficulty === 0
        ? {}
        : difficulty === 1
          ? {
              gaps: cells([
                [0, 0],
                [0, 5],
                [7, 0],
                [7, 5],
                [2, 2],
                [2, 3],
                [5, 2],
                [5, 3],
              ]),
            }
          : {
              stones: cells([
                [1, 1],
                [1, 4],
                [6, 1],
                [6, 4],
              ]),
            },
  };
}
