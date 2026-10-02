import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { readVisibleState, attemptVisiblePair, matchVisiblePair, applyTextMode, captureReachable } from './browser.mjs';

test('one-context capture waits for redraw, preserves identity and scrolls the actual card', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const backups = JSON.parse(await readFile('src/journey/backups.json', 'utf8'));
    const puzzle = backups.find(puzzle => puzzle.themeId === 13);
    const save = { version: 1, session: { puzzle, state: null, history: [], actions: [], hintLevel: 0 }, best: {}, recent: [], hinted: [] };
    const { createSession } = await import('../../src/journey/session.ts');
    save.session = createSession(puzzle);
    await page.addInitScript(save => localStorage.setItem('jelly-grove.journey-trial.v1', JSON.stringify(save)), save);
    await page.goto('http://127.0.0.1:4180/?play=lab');
    await page.getByRole('button', { name: '继续这一局', exact: true }).click();
    const before = await readVisibleState(page);
    const move = puzzle.proof.challenge[0];
    const first = await page.locator(`[data-trial-cell="${move.a.r},${move.a.c}"]`).getAttribute('aria-label');
    const second = await page.locator(`[data-trial-cell="${move.b.r},${move.b.c}"]`).getAttribute('aria-label');
    await applyTextMode(page, 'root32');
    const result = await matchVisiblePair(page, first, second);
    assert.equal(result.after.seed, before.seed);
    assert.equal(result.after.moves, before.moves + 1);
    await applyTextMode(page, 'root32');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '32px');
    await mkdir('output/journey/diagnosis', { recursive: true });
    const reachable = await captureReachable(page, '.trial-seed', 'output/journey/diagnosis/helper-root32-bottom.png');
    assert.equal(reachable.inViewport, true);
    assert.ok(reachable.scrollTop > 0);
    await applyTextMode(page, 'visible200');
    const firstSize = await page.locator('.trial-challenge').evaluate(element => getComputedStyle(element).fontSize);
    await applyTextMode(page, 'visible200');
    assert.equal(await page.locator('.trial-challenge').evaluate(element => getComputedStyle(element).fontSize), firstSize);
    assert.equal(firstSize, '24px');
    await applyTextMode(page, 'normal');
    assert.equal(await page.locator('.trial-challenge').evaluate(element => getComputedStyle(element).fontSize), '12px');
    const unchanged = await readVisibleState(page);
    const remainingName = await page.locator('#trial-board button:not(:disabled)').first().getAttribute('aria-label');
    await assert.rejects(matchVisiblePair(page, remainingName, remainingName), /Pair was rejected/);
    assert.equal((await readVisibleState(page)).moves, unchanged.moves);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('rejected visible pairs return immediately instead of waiting for a success timeout', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(1500);
    await page.addInitScript(() => localStorage.clear());
    await page.goto('http://127.0.0.1:4180/?play=lab');
    const continueButton = page.getByRole('button', { name: /继续这一局/, exact: true });
    if (await continueButton.count()) await continueButton.click();
    await page.locator('#trial-board button:not(:disabled)').first().waitFor();
    const labels = await page.locator('#trial-board button:not(:disabled)').evaluateAll(buttons => {
      const names = buttons.map(button => button.getAttribute('aria-label'));
      return [names[0], names[0]];
    });
    assert.ok(labels[0] && labels[1]);
    const result = await attemptVisiblePair(page, labels[0], labels[1], { timeout: 250 });
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.after.moves, result.before.moves);
  } finally {
    await browser.close();
  }
});
