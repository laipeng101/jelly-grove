export async function readVisibleState(page) {
  return page.evaluate(() => {
    const board = document.querySelector('#trial-board');
    const seedText = document.querySelector('.trial-seed')?.textContent ?? '';
    const movesText = document.querySelector('.trial-stats > span')?.textContent ?? '';
    return {
      seed: Number(seedText.match(/种子\s+(\d+)/)?.[1]),
      moves: Number(movesText.match(/操作\s+(\d+)/)?.[1]),
      status: document.querySelector('.trial-feedback')?.textContent ?? '',
      boardText: [...board?.querySelectorAll('button') ?? []].map(element => element.getAttribute('aria-label')).join('\n'),
      preview: board?.getAttribute('aria-label') === '下一拍位置预览',
      selected: Boolean(board?.querySelector('.selected')),
    };
  });
}

export async function waitForVisibleState(page, expected) {
  await page.waitForFunction(expected => {
    const seed = Number(document.querySelector('.trial-seed')?.textContent?.match(/种子\s+(\d+)/)?.[1]);
    const moves = Number(document.querySelector('.trial-stats > span')?.textContent?.match(/操作\s+(\d+)/)?.[1]);
    const board = document.querySelector('#trial-board');
    return seed === expected.seed && moves === expected.moves && Boolean(board) && document.querySelector('[data-trial="preview"]')?.disabled === false;
  }, expected, { timeout: 5000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return readVisibleState(page);
}

export async function matchVisiblePair(page, firstName, secondName) {
  const before = await readVisibleState(page);
  if (before.preview) throw new Error('Exit preview before matching');
  await page.getByRole('button', { name: firstName, exact: true }).click();
  await page.getByRole('button', { name: secondName, exact: true }).click();
  let after;
  try {
    after = await waitForVisibleState(page, { seed: before.seed, moves: before.moves + 1 });
  } catch (cause) {
    const current = await readVisibleState(page);
    throw new Error(`Match not confirmed; stop capture: ${JSON.stringify({ before, current })}`, { cause });
  }
  if (after.boardText === before.boardText) throw new Error('Successful-action capture still contains the old board');
  return { before, after };
}

export async function applyTextMode(page, mode) {
  if (!['normal', 'root32', 'visible200'].includes(mode)) throw new Error('Unknown text mode');
  await page.evaluate(mode => {
    document.documentElement.style.removeProperty('font-size');
    for (const element of document.querySelectorAll('[data-review-font]')) {
      if (element.dataset.reviewFont) element.style.fontSize = element.dataset.reviewFont;
      else element.style.removeProperty('font-size');
      delete element.dataset.reviewFont;
    }
    if (mode === 'root32') document.documentElement.style.fontSize = '32px';
    if (mode === 'visible200') {
      const samples = [...document.body.querySelectorAll('*')].filter(element => element.checkVisibility() && [...element.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())).map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of samples) {
        element.dataset.reviewFont = element.style.fontSize;
        element.style.fontSize = `${size * 2}px`;
      }
    }
  }, mode);
  await page.waitForFunction(mode => {
    const large = document.querySelector('.trial-page')?.classList.contains('trial-large-text');
    return mode === 'normal' ? !large : large;
  }, mode, { timeout: 5000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function captureReachable(page, selector, screenshot) {
  const target = page.locator(selector);
  await target.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const result = await target.evaluate(element => {
    const rectangle = element.getBoundingClientRect();
    const card = document.querySelector('.trial-card');
    const container = card.getBoundingClientRect();
    return { text: element.textContent, font: parseFloat(getComputedStyle(element).fontSize), inViewport: rectangle.top >= Math.max(0, container.top) - 1 && rectangle.bottom <= Math.min(innerHeight, container.bottom) + 1, scrollTop: card.scrollTop, scrollHeight: card.scrollHeight, clientHeight: card.clientHeight };
  });
  if (!result.inViewport) throw new Error(`Target is not reachable: ${selector}`);
  await page.screenshot({ path: screenshot });
  return { ...result, screenshot };
}
