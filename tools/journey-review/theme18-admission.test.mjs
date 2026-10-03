import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidate, certify, generatePuzzle } from '../../src/journey/generator.ts';
import { solve } from '../../src/journey/solver.ts';
import { selectBackup } from '../../src/journey/backups.ts';
import { theme18Model } from './theme18-model.mjs';

test('theme18 never certifies unknown or unsolvable candidates', () => {
  const puzzle = candidate(18, 3277061652);
  const unknown = solve(puzzle, { maxNodes: 0 });
  assert.equal(unknown.status, 'unknown');
  assert.equal(certify(puzzle, unknown), false);
  assert.equal(generatePuzzle(18, 3277061652, 0).status, 'unknown');
  puzzle.initial = puzzle.initial.map(row => row.map(v => v === 2 ? -1 : v));
  const unsolvable = solve(puzzle, { deadline: Infinity });
  assert.equal(unsolvable.status, 'unsolvable');
  assert.equal(certify(puzzle, unsolvable), false);
});
test('historically unfinished seeds independently reproduce challenge wins', () => {
  for (const seed of [3277061652, 4227811622, 1311065588, 153269126, 3184609586, 2598603657, 1210425299]) {
    const puzzle = candidate(18, seed);
    assert.equal(certify(puzzle, solve(puzzle, { deadline: Infinity })), true, String(seed));
    const result = theme18Model(puzzle).search().root;
    assert.equal(result.win, true);
    assert.equal(result.challenge, true);
    assert.equal(result.ordinary, true);
    assert.equal(result.minimum, puzzle.challenge.limit);
  }
});
test('theme18 fallback remains solvable when the recent pool excludes every backup', () => {
  const pool = JSON.parse(readFileSync(new URL('../../src/journey/backups.json', import.meta.url))).filter(p => p.themeId === 18);
  const selected = selectBackup(18, pool.map(p => p.id), () => 0);
  assert.equal(theme18Model(selected).search().root.challenge, true);
  selected.initial[0][0] = 99;
  assert.notEqual(selectBackup(18, [], () => 0).initial[0][0], 99);
});
