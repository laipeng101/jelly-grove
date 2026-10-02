import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeSupplementArtifacts, readArtifact, selectSupplement, validateCloseout, validateMeasurement, validateResidualRisk, validateSupplement, validateSupplementAttempt } from './closeout.mjs';

const identity = { sourceHash: 'a'.repeat(64), offlineHash: 'b'.repeat(64), ruleVersion: 1, generatorVersion: 1 };
const fixture = () => ({
  schemaVersion: 1, status: 'PASS', build: identity, freezeStart: 'unchanged', freezeEnd: 'unchanged', isolation: { blind: true, ownContext: true }, browserClosed: true, remaining: [],
  terminal: { theme: 18, seed: 123, moves: 6, status: '送达完成！★★★ · 可撤销最后一步', hintLevel: 0, goals: [{ delivered: 1, required: 1 }], evidence: 'win.txt', screenshot: 'win.png', viewed: true },
  visual: ['root32', 'visible200'].map(mode => ({ mode, before: { seed: 123, moves: 0, boardText: 'initial' }, after: { seed: 123, moves: 1, boardText: 'changed' }, controlsRestored: true, viewport: { width: 360, height: 640 }, cells: [{ width: 44, height: 44 }], fonts: { root: mode === 'root32' ? 32 : 16, title: 34, challenge: 24 }, evidence: `${mode}.json`, targets: Object.fromEntries(['goals', 'challenge', 'legend', 'seed', 'save'].map(target => [target, { inViewport: true, viewed: true, screenshot: `${mode}-${target}.png`, scrollTop: 400, scrollHeight: 1000, clientHeight: 600 }])) })),
});

test('complete bounded supplement is accepted', () => assert.deepEqual(validateSupplement(fixture(), identity), []));
test('incomplete attempts remain incomplete and can be normalized without changing their claims', () => {
  const attempt = { ...fixture(), status: 'INCOMPLETE', terminal: { ...fixture().terminal, status: '未完成' }, report: 'report.md', artifacts: [{ path: 'report.md', sha256: 'c'.repeat(64) }] };
  const binding = { schemaVersion: 1, contract: 'journey-risk-v2', build: identity, freezeStart: 'unchanged', previewAssetsMatch: true, blindAgentId: 'agent' };
  assert.deepEqual(normalizeSupplementArtifacts(attempt), { 'report.md': 'c'.repeat(64) });
  assert.deepEqual(validateSupplementAttempt(attempt, binding, identity), []);
  assert.deepEqual(validateResidualRisk({ attempts: [{ directory: 'supplement', errors: [] }, { directory: 'supplement-next', errors: [] }, { directory: 'supplement-final', errors: [] }], historical: { build: identity, threeStar: [{ theme: 18 }], visualStateCombinationCount: 72, visual: { allContactsActuallyViewed: true } }, identity }), []);
});
test('raw measurements must corroborate summary fonts, touch areas, redraw and scrolling', () => {
  const entry = fixture().visual[0];
  assert.deepEqual(validateMeasurement(entry, structuredClone(entry)), []);
  assert.deepEqual(validateMeasurement(entry, Object.fromEntries(Object.entries(entry).reverse())), []);
  for (const key of ['mode', 'before', 'after', 'fonts', 'cells', 'controlsRestored', 'viewport', 'targets']) {
    const measurement = structuredClone(entry);
    delete measurement[key];
    assert.ok(validateMeasurement(entry, measurement).includes(key));
  }
  const measurement = structuredClone(entry);
  measurement.fonts.root = 16;
  measurement.targets.seed.scrollTop = 0;
  assert.deepEqual(validateMeasurement(entry, measurement), ['fonts', 'targets']);
});
test('explicit authorized selection preserves old attempt and never auto-selects a passing attempt', () => {
  assert.deepEqual(selectSupplement(), { directory: 'supplement', binding: 'execution-binding.json' });
  assert.deepEqual(selectSupplement({ schemaVersion: 1, authorization: 'user-requested-next-supplement', directory: 'supplement-next', binding: 'execution-binding-next.json' }), { directory: 'supplement-next', binding: 'execution-binding-next.json' });
  for (const selection of [null, {}, { schemaVersion: 1, authorization: 'user-requested-next-supplement', directory: '../supplement', binding: 'execution-binding.json' }, { schemaVersion: 1, authorization: 'user-requested-next-supplement', directory: 'supplement-next', binding: '/tmp/binding.json' }]) assert.throws(() => selectSupplement(selection));
});
test('malformed supplements fail closed instead of being treated as absent optional work', () => {
  for (const document of [null, {}, { visual: {} }]) assert.ok(validateSupplement(document, identity).length > 0);
});
for (const [name, mutate] of [
  ['wrong product identity', document => document.build = { ...identity, sourceHash: 'c'.repeat(64) }],
  ['rewritten nonterminal', document => document.terminal.status = '轨道前进了一格'],
  ['unfinished quotas', document => document.terminal.goals[0].delivered = 0],
  ['hinted solution', document => document.terminal.hintLevel = 1],
  ['read answers', document => document.isolation.blind = false],
  ['missing cleanup', document => document.browserClosed = false],
  ['rejected match', document => document.visual[0].after.moves = 0],
  ['unchanged board', document => document.visual[0].after.boardText = 'initial'],
  ['changed seed', document => document.visual[0].after.seed = 456],
  ['different terminal puzzle', document => document.terminal.seed = 456],
  ['duplicate visual mode', document => document.visual.push(structuredClone(document.visual[0]))],
  ['lost zoom', document => document.visual[0].fonts.root = 16],
  ['small hit areas', document => document.visual[0].cells[0].width = 43],
  ['unreviewed screenshot', document => document.visual[0].targets.seed.viewed = false],
  ['wrong scroll container', document => Object.values(document.visual[0].targets).forEach(target => target.scrollTop = 0)],
  ['missing visual mode', document => document.visual.pop()],
  ['remaining mandatory work', document => document.remaining.push('missing terminal')],
]) test(`rejects ${name}`, () => { const document = fixture(); mutate(document); assert.ok(validateSupplement(document, identity).length > 0); });

test('final gate requires every mandatory check and preserves incomplete history', () => {
  const names = ['identity', 'independent-reviews', 'terminals', 'visual-matrix', 'specialties', 'technical-regressions', 'worker-budget', 'supplement', 'delivery'];
  const document = { contract: 'journey-risk-v2', history: { audit10: 'INCOMPLETE' }, checks: Object.fromEntries(names.map(name => [name, { status: 'PASS' }])), remaining: [] };
  assert.equal(validateCloseout(document).pass, true);
  for (const name of names) assert.equal(validateCloseout({ ...document, checks: { ...document.checks, [name]: { status: 'INCOMPLETE' } } }).pass, false);
  assert.equal(validateCloseout({ ...document, history: { audit10: 'PASS' } }).pass, false);
  assert.equal(validateCloseout({ ...document, remaining: ['blocked'] }).pass, false);
});

test('residual-risk gate rejects missing evidence and never rewrites incomplete supplement as pass', () => {
  const names = ['identity', 'independent-reviews', 'terminals', 'visual-matrix', 'specialties', 'technical-regressions', 'worker-budget', 'supplement', 'delivery'];
  const base = { contract: 'journey-risk-v2', history: { audit10: 'INCOMPLETE' }, checks: Object.fromEntries(names.map(name => [name, { status: 'PASS' }])), remaining: [], status: 'PASS_WITH_RESIDUAL_RISK' };
  assert.equal(validateCloseout({ ...base, checks: { ...base.checks, supplement: { status: 'PASS_WITH_RESIDUAL_RISK' } } }).pass, true);
  assert.equal(validateCloseout({ ...base, checks: { ...base.checks, supplement: { status: 'INCOMPLETE' } } }).pass, false);
  assert.equal(validateCloseout({ ...base, checks: { ...base.checks, supplement: { status: 'PASS' } } }).pass, false);
  assert.ok(validateResidualRisk({ attempts: [{ errors: [] }], historical: { build: identity, threeStar: [], visualStateCombinationCount: 0, visual: {} }, identity }).length > 0);
});

test('artifact read rejects hash changes, traversal, absolute paths and escaping symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'journey-closeout-'));
  try {
    await writeFile(join(directory, 'inside.txt'), 'evidence');
    const expected = createHash('sha256').update('evidence').digest('hex');
    assert.equal((await readArtifact(directory, 'inside.txt', expected)).hash, expected);
    await assert.rejects(readArtifact(directory, 'inside.txt', '0'.repeat(64)), /hash mismatch/);
    await assert.rejects(readArtifact(directory, join(directory, 'inside.txt')), /Invalid artifact/);
    await assert.rejects(readArtifact(directory, '../'), /outside/);
    await symlink(tmpdir(), join(directory, 'escape'));
    await assert.rejects(readArtifact(directory, 'escape'), /outside/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
