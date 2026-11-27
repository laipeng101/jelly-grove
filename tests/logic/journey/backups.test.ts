import test from "node:test";
import assert from "node:assert/strict";
import { selectBackup } from "../../../src/journey/backups";
import backups from "../../../src/journey/generated/backups.json";
import { validatePuzzle } from "../../../src/journey/rules";
import { THEMES } from "../../../src/journey/themes";
import { BACKUPS_PER_THEME, RECENT_PUZZLE_LIMIT, type Puzzle } from "../../../src/journey/types";

test("shipped backups are playable, distinct and avoid recent boards", () => {
  for (const { id } of THEMES) {
    const pool = (backups as Puzzle[]).filter(puzzle => puzzle.themeId === id);
    const ids = pool.map(puzzle => puzzle.id);
    assert.equal(pool.length, BACKUPS_PER_THEME);
    assert.equal(new Set(ids).size, pool.length);
    assert.ok(pool.every(validatePuzzle));

    const selected = selectBackup(id, ids, () => 0);
    assert.ok(!ids.slice(0, RECENT_PUZZLE_LIMIT).includes(selected.id));
    const original = selected.initial[0][0];
    selected.initial[0][0] = 99;
    assert.equal(selectBackup(id, ids, () => 0).initial[0][0], original);
  }
});
