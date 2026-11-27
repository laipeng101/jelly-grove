import test from "node:test";
import assert from "node:assert/strict";
import { selectBackup } from "../../src/journey/backups";
import backups from "../../src/journey/generated/backups.json";
import { validatePuzzle } from "../../src/journey/rules";
import { THEMES } from "../../src/journey/themes";
import {
  BACKUPS_PER_THEME,
  RECENT_PUZZLE_LIMIT,
  type Puzzle,
} from "../../src/journey/types";

test("every theme has valid backups with unique IDs and can select a fresh board", () => {
  const puzzles = backups as Puzzle[];
  assert.equal(new Set(puzzles.map((p) => p.id)).size, puzzles.length);
  for (const puzzle of puzzles) assert.ok(validatePuzzle(puzzle), puzzle.id);

  for (const { id } of THEMES) {
    const pool = puzzles.filter((puzzle) => puzzle.themeId === id);
    assert.equal(pool.length, BACKUPS_PER_THEME, `theme ${id}`);
    const ids = pool.map((puzzle) => puzzle.id);
    const selected = selectBackup(id, ids, () => 0);
    assert.ok(ids.slice(RECENT_PUZZLE_LIMIT).includes(selected.id), selected.id);
    const original = structuredClone(selected);
    selected.initial[0][0] = 99;
    assert.deepEqual(selectBackup(id, ids, () => 0), original);
  }
});
