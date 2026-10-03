import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connect, theme18Model } from './theme18-model.mjs';

const pool = JSON.parse(readFileSync(new URL('../../src/journey/backups.json', import.meta.url))).filter(p => p.themeId === 18);
test('independent BFS handles outside routes, stones, endpoints and turn limits', () => {
  assert.equal(connect([1, -1, 1, 0, 0, 0], 0, 2, 3), true);
  assert.equal(connect([-1, -1, -1, -1, 1, -1, -1, -1, 1], 4, 8, 3), false);
  assert.equal(connect([1, 2], 0, 1, 2), false);
  assert.equal(connect([1, 1], 0, 0, 2), false);
});
test('all theme18 backups independently have challenge and nonchallenge wins at the stated minimum', () => {
  for (const puzzle of pool) {
    const model = theme18Model(puzzle), result = model.search().root;
    assert.equal(result.win, true, puzzle.id);
    assert.equal(result.challenge, true, puzzle.id);
    assert.equal(result.ordinary, true, puzzle.id);
    assert.equal(result.minimum, puzzle.challenge.limit, puzzle.id);
    assert.equal(model.won(model.replay(result.path)), true);
  }
});
test('a structurally similar impossible puzzle is rejected without trusting stored proofs', () => {
  const puzzle = structuredClone(pool[0]);
  puzzle.initial = puzzle.initial.map(row => row.map(v => v === 2 ? -1 : v));
  assert.equal(theme18Model(puzzle).search().root.win, false);
  assert.ok(puzzle.proof.challenge.length > 0, 'stored witness must not determine independent result');
});
test('every move removes a pair and insufficient future supply cannot be spent', () => {
  for (const puzzle of pool.slice(0, 4)) {
    const model = theme18Model(puzzle);
    for (const node of model.search().cache.values()) {
      for (const choice of node.choices) {
        assert.equal(choice.next.board.filter(v => v > 0).length, node.state.board.filter(v => v > 0).length - 2);
        for (const [fruit, quota] of Object.entries(puzzle.stages[0].goal.quotas)) {
          assert.ok(choice.next.board.filter(v => v === Number(fruit)).length >= 2 * (quota - (choice.next.progress[fruit] ?? 0)));
        }
      }
    }
  }
});
