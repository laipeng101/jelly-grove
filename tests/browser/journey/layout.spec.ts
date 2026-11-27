import { test, expect, type Page } from "@playwright/test";
import { candidate, certify } from "../../../src/journey/generator";
import { solve } from "../../../src/journey/solver";
import { load, play, session } from "./fixtures";

async function checkTrialLayout(page: Page) {
  const inspect = () =>
    page.evaluate(
      () => {
        const issues: string[] = [];
        const view = visualViewport!;
        const bounds = {
          left: view.offsetLeft,
          top: view.offsetTop,
          right: view.offsetLeft + view.width,
          bottom: view.offsetTop + view.height,
        };
        const inside = (a: DOMRect, b: typeof bounds) =>
          a.left >= b.left - 1 &&
          a.top >= b.top - 1 &&
          a.right <= b.right + 1 &&
          a.bottom <= b.bottom + 1;
        const visible = (e: HTMLElement) =>
          e.getClientRects().length > 0 &&
          getComputedStyle(e).visibility !== "hidden";
        const check = (e: HTMLElement, checkText = true) => {
          const r = e.getBoundingClientRect(),
            label = e.dataset.trial ?? e.className;
          if (!inside(r, bounds) || !r.width || !r.height)
            issues.push(`${label}: outside current viewport`);
          const cx = r.left + r.width / 2,
            cy = r.top + r.height / 2;
          for (const [x, y] of [
            [cx, cy],
            [cx, r.top + Math.min(8, r.height / 4)],
            [cx, r.bottom - Math.min(8, r.height / 4)],
            [r.left + Math.min(8, r.width / 4), cy],
            [r.right - Math.min(8, r.width / 4), cy],
          ]) {
            const hit = document.elementFromPoint(x, y);
            if (!hit || (hit !== e && !e.contains(hit)))
              issues.push(
                `${label}: covered by ${hit?.tagName}.${hit?.className}`,
              );
          }
          if (
            checkText &&
            (e.scrollWidth > e.clientWidth + 1 ||
              e.scrollHeight > e.clientHeight + 1)
          )
            issues.push(`${label}: clipped text`);
          if (checkText) {
            const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(walker.currentNode);
              for (const text of range.getClientRects())
                if (!inside(text, bounds))
                  issues.push(`${label}: text outside viewport`);
            }
          }
        };
        for (const selector of [
          ".trial-goal-fruits",
          ".trial-challenge",
          ".trial-stats > span",
          ".trial-feedback",
          ".trial-title button",
          ".trial-tools button",
          ".trial-secondary button",
        ]) {
          document.querySelectorAll<HTMLElement>(selector).forEach((e) => {
            if (visible(e)) check(e);
          });
        }
        document
          .querySelectorAll<HTMLElement>(
            ".trial-title button,.trial-tools button,.trial-secondary button",
          )
          .forEach((e) => {
            const r = e.getBoundingClientRect();
            if (visible(e) && (r.width < 43.9 || r.height < 43.9))
              issues.push(`${e.dataset.trial}: control below 44px`);
            if (visible(e) && e.closest(".trial-actions")) {
              const range = document.createRange();
              range.selectNodeContents(e);
              if (range.getClientRects().length > 1)
                issues.push(`${e.dataset.trial}: wrapped action label`);
            }
          });
        document
          .querySelectorAll<HTMLElement>(
            ".trial-objective small,.trial-goal-fruits strong,.trial-challenge,.trial-stats > span,.trial-feedback",
          )
          .forEach((e) => {
            if (visible(e) && parseFloat(getComputedStyle(e).fontSize) < 12)
              issues.push(`${e.className}: important text below 12px`);
          });
        const viewport = document.querySelector<HTMLElement>(
          ".trial-board-viewport",
        )!;
        const shell =
          document.querySelector<HTMLElement>(".trial-board-shell")!;
        const vr = viewport.getBoundingClientRect(),
          sr = shell.getBoundingClientRect();
        if (
          !inside(sr, vr) ||
          viewport.scrollHeight > viewport.clientHeight + 1 ||
          viewport.scrollWidth > viewport.clientWidth + 1
        )
          issues.push("board including outer route gutter needs scrolling");
        document
          .querySelectorAll<HTMLElement>("[data-trial-cell]")
          .forEach((e) => {
            const r = e.getBoundingClientRect();
            if (r.width < 43.9 || r.height < 43.9)
              issues.push("tile below 44px");
            check(e, false);
          });
        if (
          document.querySelector(".trial-stats")!.getBoundingClientRect()
            .bottom >
            vr.top + 1 ||
          vr.bottom >
            document.querySelector(".trial-feedback")!.getBoundingClientRect()
              .top +
              1
        )
          issues.push("board overlaps HUD or feedback");
        if (
          document.documentElement.scrollWidth > innerWidth + 1 ||
          document.body.scrollHeight > view.height + 1 ||
          scrollY !== 0
        )
          issues.push("page scrolls instead of board");
        return issues;
      },
    );
  await expect.poll(inspect).toEqual([]);
}

test("360x640 touch layout, keyboard and dialog focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await load(page, { theme: 17 });
  await expect(
    page.getByRole("button", { name: "玩法说明", exact: true }),
  ).toBeInViewport();
  const first = page.locator("[data-trial-cell]:not(:disabled)").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "继续这一局" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await checkTrialLayout(page);
});

test.describe('desktop preview navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test('returning from keyboard preview restores the focused fruit and selection', async ({ page }) => {
    await load(page);
    const selected = page.locator('[data-trial-cell="0,0"]');
    const origin = page.locator('[data-trial-cell="0,1"]');
    await selected.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await expect(origin).toBeFocused();

    for (const exit of ['p', 'Enter', 'Space']) {
      await page.keyboard.press('p');
      await expect(page.getByRole('group', { name: '轨道位置预览' })).toBeVisible();
      await expect(page.getByRole('button', { name: '返回棋盘' })).toBeFocused();
      await page.keyboard.press(exit);
      await expect(page.getByRole('group', { name: '水果棋盘' })).toBeVisible();
      await expect(origin).toBeFocused();
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
    }

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-trial-cell="0,2"]')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: '已暂停' })).toBeVisible();
  });
});

for (const [width, height, fullBoard] of [
  [360, 640, true],
  [390, 700, true],
  [768, 1024, true],
  [320, 568, false],
  [740, 360, false],
] as const) {
  test(`largest trial board at ${width}x${height}: painted HUD, touch targets and route gutter`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await load(page, { theme: 17 });
    if (!fullBoard) {
      await checkScrollableTrial(page, false);
      return;
    }
    await checkTrialLayout(page);
    await page.getByRole("button", { name: "预览轨道移动", exact: true }).click();
    await checkTrialLayout(page);
    await page.getByRole("button", { name: "返回棋盘", exact: true }).click();
  });
}

async function enlargeTrialText(page: Page, mode: "root" | "visible") {
  await page.evaluate((mode) => {
    if (mode === "root") {
      document.documentElement.style.fontSize = "200%";
      return;
    }
    // Sample every computed size before any writes, avoiding compounded
    // inheritance. Reapply to new DOM after game actions, like text-only zoom.
    const enlarged = new WeakSet<HTMLElement>();
    const enlarge = () => {
      const samples = [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter(
          (e) =>
            !enlarged.has(e) &&
            e.checkVisibility() &&
            [...e.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
            ),
        )
        .map((e) => [e, parseFloat(getComputedStyle(e).fontSize)] as const);
      for (const [e, size] of samples) {
        enlarged.add(e);
        e.style.fontSize = `${size * 2}px`;
      }
    };
    new MutationObserver(enlarge).observe(document.body, {
      childList: true,
      subtree: true,
    });
    enlarge();
  }, mode);
  await expect(page.locator(".trial-page")).toHaveClass(/trial-large-text/);
}

async function checkScrollableTrial(page: Page, enlarged = true) {
  const boardViewport = page.locator(".trial-board-viewport");
  await expect
    .poll(() => boardViewport.evaluate((e) => e.clientHeight))
    .toBeGreaterThanOrEqual(132);
  if (enlarged)
    expect(
      await page
        .locator(".trial-challenge")
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(24);

  // HUD and actions may be below the fold, but must remain fully readable
  // and reachable by scrolling the card; scrolling only the board is not enough.
  await expect(page.locator(".trial-star")).toBeVisible();
  await expect(page.locator(".trial-legend")).toBeVisible();
  await expect(page.locator("#trial-save")).toBeVisible();
  const targets = page.locator(
    ".trial-title button:visible,.trial-goal-fruits,.trial-star,.trial-challenge,.trial-stats > span,.trial-feedback,.trial-tools button,.trial-secondary button,.trial-legend > span,.trial-bottom > span",
  );
  for (const target of await targets.all()) {
    // The browser's "if needed" heuristic can leave a fractional pixel at the
    // scrollport edge. Centering proves the entire label is actually reachable.
    await target.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(target).toBeInViewport({ ratio: 0.99 });
    const issues = await target.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const problems: string[] = [];
      if (
        e.scrollWidth > e.clientWidth + 1 ||
        e.scrollHeight > e.clientHeight + 1
      )
        problems.push("text clipped");
      if (e instanceof HTMLButtonElement && (r.width < 44 || r.height < 44))
        problems.push("control below 44px");
      const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const text of range.getClientRects()) {
          if (
            text.left < -1 ||
            text.right > innerWidth + 1 ||
            text.top < -1 ||
            text.bottom > innerHeight + 1
          )
            problems.push("text outside viewport");
        }
      }
      for (const [x, y] of [
        [r.left + 4, r.top + r.height / 2],
        [r.right - 4, r.top + r.height / 2],
        [r.left + r.width / 2, r.top + 4],
        [r.left + r.width / 2, r.bottom - 4],
      ]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || (hit !== e && !e.contains(hit)))
          problems.push("covered target");
      }
      return problems;
    });
    expect(issues, (await target.textContent()) ?? "target").toEqual([]);
  }

  await page.getByRole("button", { name: "查看三星条件", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "三星条件" }).getByRole("listitem")).toHaveCount(3);
  await page.keyboard.press("Escape");

  for (const edge of ["first", "last"] as const) {
    const fruit = page.locator("[data-trial-cell]:not(:disabled)")[edge]();
    await fruit.click();
    await expect(fruit).toHaveAttribute("aria-pressed", "true");
    await expect(fruit).toBeInViewport({ ratio: 0.99 });
    const painted = await fruit.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        hits: [
          [r.left + 4, r.top + r.height / 2],
          [r.right - 4, r.top + r.height / 2],
          [r.left + r.width / 2, r.top + 4],
          [r.left + r.width / 2, r.bottom - 4],
        ].map(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return {
            x,
            y,
            good: hit === e || (hit !== null && e.contains(hit)),
            hit: hit?.outerHTML.substring(0, 180),
          };
        }),
      };
    });
    expect(painted.width).toBeGreaterThanOrEqual(43.9);
    expect(painted.height).toBeGreaterThanOrEqual(43.9);
    expect(painted.hits.filter((h) => !h.good)).toEqual([]);
    await fruit.click();
    await expect(fruit).toHaveAttribute("aria-pressed", "false");
  }
  await page.getByRole("button", { name: "预览轨道移动", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "轨道位置预览" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回棋盘", exact: true }).click();
  await page.getByRole("button", { name: "玩法说明", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
}

for (const [theme, mode] of [
  [17, "root"],
  [17, "visible"],
  [18, "visible"],
] as const) {
  test(`${theme} 200 percent ${mode} type at 360x640: scroll to goals, actions and both board edges`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await load(page, { theme });
    await enlargeTrialText(page, mode);
    await checkScrollableTrial(page);
  });
}

test("200 percent root type at 390x700: scrollable card keeps controls and fruit reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await load(page, { theme: 17 });
  await enlargeTrialText(page, "root");
  await checkScrollableTrial(page);
});

// Rasterize the actual SVG shapes in cell coordinates. A button hit test cannot
// detect an opaque child hiding its fruit, and SVG boxes include transparent air.
async function inspectTrackArtwork(page: Page) {
  return page.evaluate(async () => {
    const scale = 4;
    const results = [];
    for (const cell of document.querySelectorAll<HTMLElement>(
      ".trial-cell.on-track",
    )) {
      if (Number(cell.dataset.fruit) <= 0) continue;
      const tile = cell.getBoundingClientRect();
      const fruit = cell.querySelector<SVGSVGElement>(":scope > .fruit-svg")!;
      const rect = fruit.getBoundingClientRect();
      const errors: string[] = [];
      if (tile.width < 43.9 || tile.height < 43.9) errors.push("small target");
      if (
        rect.width < Math.min(52, tile.width - 14) - 0.2 ||
        rect.height < Math.min(52, tile.height - 14) - 0.2 ||
        Math.abs(rect.x + rect.width / 2 - tile.x - tile.width / 2) > 0.2 ||
        Math.abs(rect.y + rect.height / 2 - tile.y - tile.height / 2) > 0.2
      )
        errors.push("fruit shrunk or moved from center");
      let opacity = 1;
      for (let e: Element | null = fruit; e; e = e.parentElement) {
        const style = getComputedStyle(e);
        opacity *= Number(style.opacity);
        if (style.display === "none" || style.visibility !== "visible")
          errors.push("hidden fruit");
      }
      if (opacity < 0.75) errors.push("faded fruit");
      const width = Math.ceil(tile.width * scale),
        height = Math.ceil(tile.height * scale);
      const raster = async (elements: SVGSVGElement[]) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        for (const element of elements) {
          const box = element.getBoundingClientRect();
          const copy = element.cloneNode(true) as SVGSVGElement;
          const style = getComputedStyle(element);
          copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          copy.setAttribute("width", String(box.width));
          copy.setAttribute("height", String(box.height));
          // Fruit paint uses local gradient IDs; preserve those attributes.
          copy.setAttribute(
            "style",
            `color:${style.color};fill:${style.fill};stroke:${style.stroke};stroke-width:${style.strokeWidth};stroke-linecap:${style.strokeLinecap};stroke-linejoin:${style.strokeLinejoin}`,
          );
          const image = new Image();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
          await image.decode();
          context.drawImage(
            image,
            (box.x - tile.x) * scale,
            (box.y - tile.y) * scale,
            box.width * scale,
            box.height * scale,
          );
        }
        return context.getImageData(0, 0, width, height).data;
      };
      const markers = [
        ...cell.querySelectorAll<SVGSVGElement>(
          ".trial-arrow,.trial-port-mark",
        ),
      ];
      if (!markers.length || cell.querySelector("span.trial-arrow"))
        errors.push("missing graphical marker");
      const arrow = cell.querySelector<SVGPathElement>(".trial-arrow path");
      if (arrow) {
        const matrix = arrow.getScreenCTM()!;
        const tail = new DOMPoint(2, 6).matrixTransform(matrix),
          head = new DOMPoint(10, 6).matrixTransform(matrix);
        const direction =
          Math.abs(head.x - tail.x) > Math.abs(head.y - tail.y)
            ? head.x > tail.x
              ? "→"
              : "←"
            : head.y > tail.y
              ? "↓"
              : "↑";
        if (!cell.getAttribute("aria-label")?.includes(direction))
          errors.push("painted direction differs from accessible direction");
      }
      for (const marker of markers) {
        const style = getComputedStyle(marker);
        if (
          style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
          style.backgroundImage !== "none" ||
          style.boxShadow !== "none" ||
          style.filter !== "none" ||
          marker.textContent?.trim()
        )
          errors.push("marker contains background or text");
        const size = marker.getBoundingClientRect();
        if (
          size.width < 11.9 ||
          size.width > 16.1 ||
          Math.abs(size.height - size.width) > 0.1
        )
          errors.push("marker does not follow tile size");
      }
      const fruitPixels = await raster([fruit]);
      const markerPixels = await raster(markers);
      let painted = false;
      let covered = false;
      for (let index = 3; index < fruitPixels.length; index += 4) {
        if (fruitPixels[index] < 64) continue;
        painted = true;
        if (markerPixels[index] >= 64) {
          covered = true;
          break;
        }
      }
      if (!painted) errors.push("fruit has no visible artwork");
      if (covered) errors.push("marker covers fruit artwork");
      results.push({ coordinate: cell.dataset.trialCell, errors });
    }
    return results;
  });
}

async function checkTrackArtwork(page: Page, phase: string) {
  const report = await inspectTrackArtwork(page);
  expect(report.length).toBeGreaterThan(0);
  expect(
    report.flatMap((cell) =>
      cell.errors.map((error) => `${cell.coordinate}: ${error}`),
    ),
    phase,
  ).toEqual([]);
  // Scroll every fruit into view, including the board's middle rows. Geometry
  // above verifies graphic overlap; this verifies actual ancestor clipping.
  for (const cell of await page.locator(".trial-cell.on-track").all()) {
    if (Number(await cell.getAttribute("data-fruit")) <= 0) continue;
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeInViewport({ ratio: 0.99 });
    const clipped = await cell.evaluate((element) => {
      const fruit = element
        .querySelector(".fruit-svg")!
        .getBoundingClientRect();
      const issues: string[] = [];
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent),
          box = parent.getBoundingClientRect();
        if (
          style.overflowY !== "visible" &&
          (fruit.top < box.top - 1 || fruit.bottom > box.bottom + 1)
        )
          issues.push("vertical clipping");
        if (
          style.overflowX !== "visible" &&
          (fruit.left < box.left - 1 || fruit.right > box.right + 1)
        )
          issues.push("horizontal clipping");
      }
      return issues;
    });
    expect(clipped).toEqual([]);
  }
}

for (const theme of [13, 14, 15, 16, 18] as const) {
  test(`theme ${theme}: arrows and ports leave the fruit artwork visible`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await load(page, { theme });
    await checkTrackArtwork(page, "initial");
  });
}

// This dual-track seed puts a fruit at a port. It exercises both markers on
// the same tile as well as scroll clipping after the board is redrawn.
for (const mode of ["normal", "root", "visible"] as const) {
  test(`dual-track ${mode} artwork remains visible through board redraws`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 360, height: 640 });
    const initial = candidate(17, 556785146);
    expect(certify(initial, solve(initial))).toBe(true);
    const p = await load(page, { initial });
    if (mode !== "normal") await enlargeTrialText(page, mode);
    await checkTrackArtwork(page, "initial");

    const target = page.locator(".trial-cell.on-track.trial-port:not(:disabled)").first();
    await target.click();
    await expect(target).toHaveAttribute("aria-pressed", "true");
    await checkTrackArtwork(page, "selected");
    await page.getByRole("button", { name: "预览轨道移动", exact: true }).click();
    await expect(page.locator(".trial-preview")).toBeVisible();
    await checkTrackArtwork(page, "preview");

    await page.getByRole("button", { name: "返回棋盘", exact: true }).click();
    await play(page, p.proof.challenge[0]);
    await checkTrackArtwork(page, "moved");
    await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
    await expect
      .poll(async () => (await session(page)).state.moves)
      .toBe(0);
    await checkTrackArtwork(page, "restored");
    expect(pageErrors).toEqual([]);
  });
}

test("short screen with large text keeps the save failure reachable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 540 });
  const p = await load(page, { theme: 17 });
  await enlargeTrialText(page, "visible");
  await checkScrollableTrial(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    };
  });
  // A real move triggers the save failure. It stays playable without storage.
  for (const point of [p.proof.challenge[0].a, p.proof.challenge[0].b])
    await page.locator(`[data-trial-cell="${point.r},${point.c}"]`).click();
  await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
  const status = page.locator("#trial-save");
  await expect(status).toHaveText("进度未保存，请导出");
  await status.scrollIntoViewIfNeeded();
  await expect(status).toBeInViewport({ ratio: 0.99 });
  expect(
    await status.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("未能保存进度");
});
