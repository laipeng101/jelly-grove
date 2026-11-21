import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { candidate, certify } from "../../../src/journey/generator";
import { solve } from "../../../src/journey/solver";
import { load, play, puzzle as backupPuzzle, session } from "./fixtures";

async function loadHiddenLoss(page: Page, url?: string) {
  const initial = candidate(18, 1311065588);
  expect(certify(initial, solve(initial))).toBe(true);
  await load(page, { initial, url });
  await play(page, { a: { r: 3, c: 0 }, b: { r: 3, c: 1 } });
  await play(page, { a: { r: 1, c: 1 }, b: { r: 0, c: 1 } });
  await expect(page.locator('[data-star="3"]')).toHaveAttribute('data-status', 'failed');
  return initial;
}

for (const theme of [13, 14, 15, 16, 17, 18] as const) test(`theme ${theme}: three readable separate star conditions and full mobile board`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await load(page, { theme });
  await expect(page.locator('.trial-star-row')).toHaveCount(3);
  for (const condition of await page.locator('.trial-star-condition').all())
    await expect(condition).not.toHaveText(/^(第一|第二|第三)星$/);
  await expect.poll(() => page.evaluate(() => {
    const conditions = [...document.querySelectorAll('.trial-star-condition')];
    const board = document.querySelector('.trial-board-viewport')!;
    const shell = document.querySelector('.trial-board-shell')!;
    const bounds = shell.getBoundingClientRect();
    return conditions.every(e => parseFloat(getComputedStyle(e).fontSize) >= 16) && board.scrollHeight <= board.clientHeight + 1 && bounds.bottom <= innerHeight && [...document.querySelectorAll('[data-trial-cell]')].every(e => {
      const r = e.getBoundingClientRect();
      return r.width >= 43.9 && r.height >= 43.9 && r.top >= 0 && r.bottom <= innerHeight;
    });
  })).toBe(true);
});
test('hidden challenge loss explains undo without covering the mobile board', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await loadHiddenLoss(page);
  const challenge = page.locator('[data-star="3"]');
  const undo = page.getByRole('button', { name: '撤销一步', exact: true });
  await expect(challenge).toContainText('本盘未达成');
  await expect(undo).toBeInViewport();
  await expect.poll(() => page.locator('.trial-board-viewport').evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  for (const text of await page.locator('.trial-star-condition,.trial-star-reason:visible').all())
    await expect(text).toBeInViewport();
  expect((await session(page)).hintLevel).toBe(0);
  expect((await session(page)).state.fuelUsed).toBe(1);

  await undo.focus();
  const replaced = await page.evaluate(() => {
    const previous = document.querySelector('.trial-card > .trial-stars-card')!;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return !previous.isConnected;
  });
  expect(replaced).toBe(true);
  await expect(undo).toBeFocused();
  await undo.click();
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  await expect(challenge).toHaveAttribute('data-status', 'pending');
});
for (const kind of ['challenge', 'ordinary'] as const) test(`completion ${kind}: reasons, stay, refresh and undo replay`, async ({ page }) => {
  const puzzle = await load(page);
  for (const move of puzzle.proof[kind]) await play(page, move);
  await expect(page.locator('#trial-result-stay')).toBeVisible();
  await expect(page.locator('.trial-dialog .trial-star-row')).toHaveCount(3);
  await expect(page.locator('.trial-dialog [data-star="3"]')).toHaveAttribute('data-status', kind === 'challenge' ? 'achieved' : 'failed');
  await page.locator('#trial-result-stay').click();
  await expect(page.locator('[data-trial="result"]')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '继续这一局', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  await play(page, puzzle.proof[kind].at(-1)!);
  await expect(page.locator('#trial-result-stay')).toBeVisible();
});
test('next theme only starts after explicit confirmation', async ({ page }) => {
  const puzzle = await load(page);
  for (const move of puzzle.proof.challenge) await play(page, move);
  expect((await session(page)).puzzle.themeId).toBe(13);
  await page.locator('#trial-result-next').click();
  await expect.poll(async () => (await session(page)).puzzle.themeId).toBe(14);
});
test('final theme offers theme selection instead of unsupported level 19', async ({ page }) => {
  const puzzle = await load(page, { theme: 18 });
  for (const move of puzzle.proof.challenge) await play(page, move);
  await expect(page.getByRole('dialog')).toContainText('送达完成');
  await expect(page.locator('#trial-result-next')).toHaveText(/选择主题/);
  await page.locator('#trial-result-next').click();
  await expect(page.locator('[data-pick-theme]')).toHaveCount(6);
  expect((await session(page)).puzzle.themeId).toBe(18);
});
test('normal motion slides surviving track fruit and idle cues preserve board state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const puzzle = await load(page, { theme: 18, motion: true });
  await expect(page.locator('.trial-idle-cue')).toBeVisible({ timeout: 5000 });
  const before = await session(page);
  await expect.poll(() => page.locator('.trial-idle-cue .fruit-svg').evaluateAll(elements => elements.some(e => getComputedStyle(e).animationName === 'trial-direction-cue'))).toBe(true);
  expect((await session(page)).state).toEqual(before.state);
  const move = puzzle.proof.challenge[0];
  await page.locator(`[data-trial-cell="${move.a.r},${move.a.c}"]`).click();
  await expect(page.locator('.trial-idle-cue')).toHaveCount(0);
  await page.locator(`[data-trial-cell="${move.b.r},${move.b.c}"]`).click();
  await expect(page.locator('.trial-moving-fruit').first()).toBeVisible();
  await expect(page.locator('[data-motion-phase]')).toHaveCount(0);
  await expect(page.locator('.trial-moving-fruit')).toHaveCount(0);
  expect((await session(page)).state.moves).toBe(1);
});
for (const reduced of [true, false]) test(`motion disabled path reduced=${reduced} has no slide or idle animation`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.clock.install();
  const puzzle = await load(page, { theme: 18, motion: reduced });
  await page.clock.pauseAt(new Date());
  await play(page, puzzle.proof.challenge[0], { waitForMotion: false });
  expect(await page.locator('[data-trial="preview"]').isEnabled()).toBe(true);
  expect(await page.locator('[data-motion-phase], .trial-moving-fruit').count()).toBe(0);
  await page.clock.fastForward(1700);
  await expect(page.locator('.trial-idle-cue')).toHaveCount(0);
});

test('offline automatic loss check, undo, final harvest and reload need no network', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.setOffline(true);
  const url = pathToFileURL(resolve('dist/果冻果园.html')).href + '?play=lab';
  const puzzle = await loadHiddenLoss(page, url);
  expect((await session(page)).hintLevel).toBe(0);
  await page.getByRole('button', { name: '撤销一步', exact: true }).click();
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  for (const move of puzzle.proof.challenge) await play(page, move);
  await expect(page.getByRole('dialog')).toContainText('送达完成');
  await page.locator('#trial-result-stay').click();
  await page.reload();
  await page.getByRole('button', { name: '继续这一局', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-trial="result"]').click();
  await expect(page.locator('.trial-dialog [data-star="3"]')).toHaveAttribute('data-status', 'achieved');
  expect(errors).toEqual([]);
});
test('resizing during slide cancels overlays and preserves final playable state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const puzzle = await load(page, { theme: 18, motion: true });
  await play(page, puzzle.proof.challenge[0], { waitForMotion: false });
  await expect(page.locator('.trial-moving-fruit').first()).toBeVisible();
  // The copied art must retain unique SVG gradient references.
  expect(await page.locator('[id]').evaluateAll(nodes => nodes.length === new Set(nodes.map(e => e.id)).size)).toBe(true);
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator('.trial-moving-fruit')).toHaveCount(0);
  await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
  await expect(page.locator('.trial-cell .fruit-svg[style*="hidden"]')).toHaveCount(0);
  const saved = await session(page);
  expect(saved.state.moves).toBe(1);
  const board = await page.locator('[data-trial-cell]').evaluateAll(elements => elements.map(e => Number((e as HTMLElement).dataset.fruit)));
  expect(board).toEqual(saved.state.board.flat());
});

test('automatic checker unavailable never marks challenge lost or consumes hints', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('worker unavailable'); } } as unknown as typeof Worker; });
  await load(page, { theme: 18 });
  await expect(page.locator('[data-star="3"]')).toHaveAttribute('data-status', 'pending');
  await expect(page.locator('[data-star="3"]')).not.toContainText('本盘未达成');
  expect((await session(page)).hintLevel).toBe(0);
});
test('stale checker failure cannot overwrite an undone position', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror = null;
      postMessage(data: { state: { moves: number } }) {
        const callback = this.onmessage;
        if (data.state.moves) {
          // Deliver after undo, even though the old worker was terminated.
          Object.assign(window, {
            deliverStaleChallenge: () => callback?.({ data: { status: 'failed', reason: '旧局面已失败' } } as MessageEvent),
          });
          return;
        }
        callback?.({ data: { status: 'possible', reason: '仍可完成' } } as MessageEvent);
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  const puzzle = await load(page, { theme: 18 });
  await play(page, puzzle.proof.challenge[0]);
  await page.getByRole('button', { name: '↶ 撤销', exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { deliverStaleChallenge: () => void }).deliverStaleChallenge();
  });
  await expect(page.locator('[data-star="3"]')).toHaveAttribute('data-status', 'pending');
  expect((await session(page)).state.moves).toBe(0);
  expect((await session(page)).hintLevel).toBe(0);
});

test('cached page restore restarts canceled checker without replacing board or focus', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror = null;
      private timer = 0;
      postMessage() {
        this.timer = window.setTimeout(() => this.onmessage?.({ data: { status: 'possible', reason: '恢复检查完成' } } as MessageEvent), 500);
      }
      terminate() { clearTimeout(this.timer); }
    } as unknown as typeof Worker;
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await load(page, { theme: 18 });
  const original = await session(page);
  const before = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.trial-card')!;
    const viewport = document.querySelector<HTMLElement>('.trial-board-viewport')!;
    const cell = document.querySelector<HTMLButtonElement>('[data-trial-cell]:not(:disabled)')!;
    cell.focus({ preventScroll: true });
    card.scrollTop = card.scrollHeight;
    viewport.scrollTop = viewport.scrollHeight;
    (window as unknown as { retainedBoard: Element }).retainedBoard = document.querySelector('#trial-board')!;
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return { card: card.scrollTop, viewport: viewport.scrollTop, focused: cell.dataset.trialCell };
  });
  await expect(page.locator('.trial-card [data-star="3"]')).toContainText('恢复检查完成');
  expect(await page.evaluate(() => ({
    card: document.querySelector('.trial-card')!.scrollTop,
    viewport: document.querySelector('.trial-board-viewport')!.scrollTop,
    focused: (document.activeElement as HTMLElement).dataset.trialCell,
    retained: (window as unknown as { retainedBoard: Element }).retainedBoard === document.querySelector('#trial-board'),
  }))).toEqual({ ...before, retained: true });
  expect((await session(page)).state).toEqual(original.state);
  expect((await session(page)).hintLevel).toBe(0);
});

test('cached page restore resumes the requested theme after generation was canceled', async ({ page }) => {
  await page.addInitScript(next => {
    const requests: number[] = [];
    Object.assign(window, { generationRequests: requests });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      override postMessage(data: { themeId?: number }) {
        if (data.themeId === undefined) {
          super.postMessage(data);
          return;
        }
        requests.push(data.themeId);
        if (requests.length === 2) {
          const reply = new MessageEvent("message", { data: { status: "generated", puzzle: next } });
          queueMicrotask(() => this.dispatchEvent(reply));
        }
      }
    };
  }, backupPuzzle(18));
  await load(page);
  await page.locator(".trial-theme-button").click();
  await page.locator('[data-pick-theme="18"]').click();
  await expect(page.locator('[data-trial="preview"]')).toBeDisabled();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(page.locator(".trial-theme-button")).toContainText("18 ·");
  await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
  expect(await page.evaluate(() => Object.getOwnPropertyDescriptor(window, "generationRequests")?.value)).toEqual([18, 18]);
});

for (const theme of [16, 17] as const) test(`theme ${theme}: lost challenge still fits full 360x640 board`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const puzzle = await load(page, { theme });
  for (const move of puzzle.proof.ordinary.slice(0, theme === 16 ? 1 : 2)) await play(page, move);
  await expect(page.locator('.trial-card [data-star="3"]')).toHaveAttribute('data-status', 'failed');
  await expect.poll(() => page.locator('.trial-board-viewport').evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  await expect(page.getByRole('button', { name: '撤销一步', exact: true })).toBeInViewport();
  expect(await page.locator('.trial-star-condition').evaluateAll(elements => elements.every(e => parseFloat(getComputedStyle(e).fontSize) >= 16))).toBe(true);
  expect(await page.locator('[data-trial-cell]').evaluateAll(elements => elements.every(e => {
    const bounds = e.getBoundingClientRect();
    return bounds.width >= 43.9 && bounds.height >= 43.9 && bounds.bottom <= innerHeight;
  }))).toBe(true);
});
