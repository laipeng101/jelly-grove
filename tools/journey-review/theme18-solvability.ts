import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { candidate, certify, generatePuzzle } from '../../src/journey/generator';
import { initialState, attemptMatch, legalMoves, challengeMet } from '../../src/journey/rules';
import { solve } from '../../src/journey/solver';
import { createSession } from '../../src/journey/session';
import { emptyJourneySave, KEY, parseJourneySave } from '../../src/journey/storage';
import backups from '../../src/journey/backups.json';
import { theme18Model } from './theme18-model.mjs';
import type { Puzzle, Move, JourneyState } from '../../src/journey/types';

const output = resolve('output/journey/theme18-solvability');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const freeze = () => JSON.parse(execFileSync(process.execPath, ['scripts/freeze-journey.mjs', 'verify'], { encoding: 'utf8' }));
const build = freeze();
const count = Number(process.env.THEME18_COUNT ?? 1000);
assert.ok(Number.isInteger(count) && count >= 1);
await mkdir(output, { recursive: true });
await writeFile(`${output}/report.json`, JSON.stringify({ schemaVersion: 1, status: 'INCOMPLETE', startedAt: new Date().toISOString(), build, reason: 'Verification running; prior PASS must not be reused.' }, null, 2) + '\n');
const checked: any[] = [];
let stateCount = 0, edgeCount = 0;
const moveKey = (move: Move) => [move.a, move.b].map(p => `${p.r},${p.c}`).sort().join(':');

function checkPuzzle(p: Puzzle, source: string, requestSeed?: number) {
  const independent = theme18Model(p), searched = independent.search();
  assert.equal(searched.root.win, true, `${p.id}: no ordinary win`);
  assert.equal(searched.root.challenge, true, `${p.id}: no challenge win`);
  assert.equal(searched.root.ordinary, true, `${p.id}: no nonchallenge win`);
  assert.equal(searched.root.minimum, p.challenge.kind === 'fuel' ? p.challenge.limit : -1);
  assert.equal(searched.root.minimum, p.proof.minimumFuel);
  for (const kind of ['win', 'challenge', 'ordinary'] as const) {
    const terminal = independent.replay(p.proof[kind]);
    assert.ok(terminal && independent.won(terminal), `${p.id}/${kind}: invalid proof`);
    if (kind !== 'win') assert.equal(terminal.fuel <= searched.root.minimum, kind === 'challenge');
  }
  // Cross-check every independently reachable state against runtime behavior.
  const visited = new Set<string>();
  const visit = (state: JourneyState) => {
    const normalized = { board: state.board.flat(), progress: state.progress[0], fuel: state.fuelUsed };
    const key = independent.key(normalized);
    if (visited.has(key)) return;
    visited.add(key);
    const node = searched.cache.get(key);
    assert.ok(node, `${p.id}: runtime escaped independent graph`);
    assert.equal(state.phase === 'won', independent.won(normalized));
    const moves = legalMoves(p, state);
    assert.deepEqual(moves.map(moveKey).sort(), independent.moves(normalized).map(moveKey).sort(), `${p.id}: move mismatch`);
    for (const move of moves) {
      const next = attemptMatch(p, state, move);
      assert.ok(next.ok);
      if (!next.ok) throw new Error('Runtime refused independent move');
      const expected = independent.step(normalized, move);
      assert.deepEqual(next.state.board.flat(), expected.board);
      assert.deepEqual(next.state.progress[0], expected.progress);
      assert.equal(next.state.fuelUsed, expected.fuel);
      visit(next.state);
    }
  };
  visit(initialState(p));
  assert.equal(visited.size, searched.cache.size);
  stateCount += searched.cache.size;
  edgeCount += searched.edges;
  const result = { source, requestSeed, id: p.id, seed: p.seed, minimumFuel: searched.root.minimum, maximumFuel: searched.root.maximum, states: searched.cache.size, edges: searched.edges, challengeMoves: searched.root.path.length, puzzleHash: digest(JSON.stringify(p)), independentChallenge: searched.root.path };
  checked.push(result);
  return result;
}

const fruitNames = ['空格', '草莓', '蜜橘', '青柠', '蓝莓', '蜜桃', '葡萄', '西瓜', '香梨', '樱桃', '芒果'];
function boardFromText(text: string) {
  const board = Array.from({ length: 4 }, () => Array(5).fill(null));
  for (const match of text.matchAll(/(石头|空格|草莓|蜜橘|青柠|蓝莓|蜜桃|葡萄|西瓜|香梨|樱桃|芒果)，第\s*(\d+)\s*行第\s*(\d+)\s*列/g)) {
    if (Number(match[2]) > 4 || Number(match[3]) > 5) throw new Error('Snapshot includes a different board shape');
    board[Number(match[2]) - 1][Number(match[3]) - 1] = match[1] === '石头' ? -1 : fruitNames.indexOf(match[1]);
  }
  if (board.flat().some(v => v === null)) {
    for (const match of text.matchAll(/第\s*(\d+)\s*行[：:]([^\n]+)/g)) {
      const values = match[2].trim().split(/\s+/);
      if (values.length === 5) board[Number(match[1]) - 1] = values.map(name => name === '石头' ? -1 : fruitNames.indexOf(name));
    }
  }
  assert.ok(board.flat().every(v => v !== null && v >= -1), 'Incomplete visible board');
  return board;
}
const historical: any[] = [], historicalPuzzles: Puzzle[] = [];
async function checkHistorical(path: string, source: string) {
  const text = await readFile(path, 'utf8');
  const seed = Number([...text.matchAll(/种子\s+(\d+)/g)].at(-1)?.[1]);
  assert.ok(Number.isInteger(seed));
  const p = candidate(18, seed);
  assert.deepEqual(p.initial, boardFromText(text), `Historical seed ${seed} differs from visible initial board`);
  const solved = solve(p, { deadline: performance.now() + 10000, maxNodes: 100000 });
  assert.equal(certify(p, solved), true, `${seed}: original seed fails certification`);
  const limit = Number(text.match(/普通水果最多消耗\s+(\d+)\s+对/)?.[1]);
  assert.equal(p.challenge.kind === 'fuel' ? p.challenge.limit : -1, limit);
  // Ports and per-cell arrows must also reproduce the original snapshot.
  if (text.includes('，轨道')) {
    const dirs: Record<string, [number, number]> = { '↑': [-1, 0], '↓': [1, 0], '←': [0, -1], '→': [0, 1] };
    for (const match of text.matchAll(/第\s*(\d+)\s*行第\s*(\d+)\s*列[^\n]*?轨道(\d+)([↑↓←→])/g)) {
      const cell = { r: Number(match[1]) - 1, c: Number(match[2]) - 1 };
      const movement = p.stages[0].movement;
      assert.equal(movement.kind, 'conveyor');
      if (movement.kind !== 'conveyor') throw new Error('Expected conveyor');
      const track = movement.tracks[Number(match[3]) - 1];
      const index = track.cells.findIndex(q => q.r === cell.r && q.c === cell.c);
      assert.ok(index >= 0);
      const next = track.cells[(index + track.direction + track.cells.length) % track.cells.length];
      assert.deepEqual([next.r - cell.r, next.c - cell.c], dirs[match[4]]);
      if (match[0].includes('采收口')) assert.ok(p.stages[0].ports.some(q => q.r === cell.r && q.c === cell.c));
    }
  } else {
    const movement = p.stages[0].movement;
    assert.equal(movement.kind, 'conveyor');
    if (movement.kind !== 'conveyor') throw new Error('Expected conveyor');
    for (const match of text.matchAll(/轨道(\d+)：([^\n]+?)；采收口\((\d+),(\d+)\)/g)) {
      const cells = [...match[2].matchAll(/\((\d+),(\d+)\)/g)].map(m => ({ r: Number(m[1]) - 1, c: Number(m[2]) - 1 }));
      const track = movement.tracks[Number(match[1]) - 1];
      assert.equal(track.direction, 1);
      assert.deepEqual(track.cells, cells);
      assert.ok(p.stages[0].ports.some(q => q.r === Number(match[3]) - 1 && q.c === Number(match[4]) - 1));
    }
  }
  const result = checkPuzzle(p, source);
  historical.push({ ...result, evidence: path, evidenceHash: digest(text) });
  historicalPuzzles.push(p);
}
for (const directory of ['supplement', 'supplement-next', 'supplement-final']) {
  await checkHistorical(`output/journey/risk-closeout/${directory}/initial.txt`, directory);
  const terminalText = await readFile(`output/journey/risk-closeout/${directory}/terminal.txt`, 'utf8');
  const summary = JSON.parse(await readFile(`output/journey/risk-closeout/${directory}/summary.json`, 'utf8'));
  const terminal = summary.terminal;
  const puzzle = historicalPuzzles.at(-1)!;
  const model = theme18Model(puzzle);
  const goals = terminal.goals;
  const progress = Array.isArray(goals)
    ? { 1: goals[0].delivered, 2: goals[1].delivered }
    : { 1: goals['草莓'].delivered, 2: goals['蜜橘'].delivered };
  const fuel = terminal.challenge?.current ?? Number(terminalText.match(/（当前\s+(\d+)）/)?.[1]);
  const state = { board: boardFromText(terminalText).flat(), progress: Object.fromEntries(Object.entries(progress).filter(([, n]) => n > 0)), fuel };
  const initialGraph = model.search();
  assert.ok(initialGraph.cache.has(model.key(state)), `${directory}: terminal is not independently reachable`);
  const continuation = model.search(state).root;
  historical.at(-1).stoppedState = { win: continuation.win, challenge: continuation.challenge, moves: terminal.moves, fuel, classification: continuation.challenge ? 'stopped with challenge solution remaining' : continuation.win ? 'challenge lost after legal choices; ordinary win remains' : 'dead end after legal choices; undo restores solvable initial board', evidenceHash: digest(terminalText) };
}
for (const name of (await readdir('output/journey/audit10/blind-final')).sort()) {
  if (!name.endsWith('.txt')) continue;
  const path = `output/journey/audit10/blind-final/${name}`, text = await readFile(path, 'utf8');
  if (!text.includes('18 · 综合送达') || !/操作\s+0(?:\D|$)/.test(text) || !/种子\s+\d+/.test(text) || /第\s*[5-9]\s*行|第\s*[6-9]\s*列/.test(text) || !/初盘|initial|new-board/.test(name) || /\"theme\"\s*:/.test(text)) continue;
  const seed = Number([...text.matchAll(/种子\s+(\d+)/g)].at(-1)?.[1]);
  if (historical.some(entry => entry.seed === seed)) continue;
  await checkHistorical(path, 'audit10-blind-final');
}
for (const p of (backups as Puzzle[]).filter(p => p.themeId === 18)) checkPuzzle(p, 'backup');
console.log(`Historical ${historical.length} and all 32 theme18 backups independently verified.`);
for (let i = 0; i < count; i++) {
  const requestSeed = (0x9e3779b9 * (i + 1) + 181003) >>> 0;
  const result = generatePuzzle(18, requestSeed, 2750);
  assert.equal(result.status, 'generated', `Request ${requestSeed} failed to generate`);
  if (result.status !== 'generated') throw new Error('Generation incomplete');
  checkPuzzle(result.puzzle, 'node-generated', requestSeed);
  if ((i + 1) % 100 === 0) console.log(`Node generated ${i + 1}/${count}; independent states ${stateCount}.`);
}

const browser = await chromium.launch();
const browserVersion = browser.version();
const browserSamples: any[] = [], ui: any[] = [], browserErrors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    (window as any).__theme18Responses = [];
    window.Worker = class extends OriginalWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', event => (window as any).__theme18Responses.push({ id: event.data.puzzle?.id, status: event.data.status }));
      }
    };
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(`${pathToFileURL(resolve('dist/果冻果园.html'))}?play=lab`);
  await page.locator('#trial-board').waitFor();
  await page.locator('.trial-theme-button').click();
  await page.locator('[data-pick-theme="18"]').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.session?.puzzle?.themeId === 18, KEY);
  await page.locator('[data-trial="preview"]:enabled').waitFor();
  // UI requests test client admission, crypto seeds and real Worker/fallback behavior.
  for (let i = 0; i < 100; i++) {
    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session.puzzle.id, KEY);
    const started = performance.now();
    await page.locator('[data-trial="new"]').click();
    await page.locator('#trial-confirm-new').click();
    await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key) ?? 'null')?.session?.puzzle?.id !== id, { key: KEY, id: before });
    await page.locator('[data-trial="preview"]:enabled').waitFor();
    const p = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session.puzzle, KEY);
    const generated = await page.evaluate(id => (window as any).__theme18Responses.some((entry: any) => entry.id === id && entry.status === 'generated'), p.id);
    const result = checkPuzzle(p, generated ? 'offline-browser-generated' : 'offline-browser-backup');
    browserSamples.push({ ...result, generated, elapsedMs: performance.now() - started });
    if ((i + 1) % 25 === 0) console.log(`Offline browser generated ${i + 1}/100.`);
  }
  await context.close();
  for (const puzzle of historicalPuzzles.slice(0, 3)) {
    const c = await browser.newContext({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' });
    const save = emptyJourneySave();
    save.session = createSession(puzzle);
    parseJourneySave(JSON.stringify(save));
    await c.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: KEY, save });
    await c.setOffline(true);
    const page = await c.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(`${pathToFileURL(resolve('dist/果冻果园.html'))}?play=lab`);
    await page.getByRole('button', { name: '继续这一局', exact: true }).click();
    const model = theme18Model(puzzle), path = model.search().root.path;
    let moves = 0;
    for (const move of path) {
      await page.locator('[data-trial="preview"]:enabled').waitFor();
      await page.locator(`[data-trial-cell="${move.a.r},${move.a.c}"]`).click();
      await page.locator(`[data-trial-cell="${move.b.r},${move.b.c}"]`).click();
      moves++;
      await page.waitForFunction(({ key, moves }) => JSON.parse(localStorage.getItem(key)!).session.state.moves === moves, { key: KEY, moves });
    }
    await page.waitForFunction(() => document.querySelector('.trial-feedback')?.textContent?.includes('送达完成！★★★'));
    const terminal = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session, KEY);
    assert.equal(terminal.state.phase, 'won');
    assert.equal(terminal.hintLevel, 0);
    assert.equal(challengeMet(puzzle, terminal.state), true);
    await page.screenshot({ path: `${output}/${puzzle.seed}-three-stars.png` });
    ui.push({ seed: puzzle.seed, moves, text: await page.locator('.trial-feedback').innerText(), hintLevel: terminal.hintLevel, screenshot: `${puzzle.seed}-three-stars.png`, method: 'independent solution replay via real UI; technical, not blind play' });
    await c.close();
  }
} finally { await browser.close(); }
assert.deepEqual(browserErrors, []);
const end = freeze();
assert.deepEqual(end, build);
const artifacts: Record<string, string> = {};
for (const path of ['tools/journey-review/theme18-model.mjs', 'tools/journey-review/theme18-model.test.mjs', 'tools/journey-review/theme18-admission.test.mjs', 'tools/journey-review/theme18-solvability.ts']) artifacts[path] = digest(await readFile(path));
for (const entry of ui) entry.screenshotHash = digest(await readFile(`${output}/${entry.screenshot}`));
const report = { schemaVersion: 1, status: 'PASS', checkedAt: new Date().toISOString(), build, historical, nodeGenerated: count, browserRequests: browserSamples.length, browserGenerated: browserSamples.filter(sample => sample.generated).length, browserVersion, browserViewport: { width: 360, height: 640 }, backups: 32, stateCount, edgeCount, artifacts, errors: [], ui, checked, browserSamples, limitations: ['Finite samples are not exhaustive over all 32-bit seeds.', 'Generated candidates require complete certification; unknown results are never admitted.', 'Wrong legal choices may create dead ends by design; this is different from an unsolvable initial puzzle.', 'Technical replay does not complete the historical blind reviews or measure human difficulty.'] };
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, historical: historical.length, nodeGenerated: count, browserGenerated: browserSamples.length, backups: 32, stateCount, edgeCount, ui, report: `${output}/report.json` }, null, 2));
