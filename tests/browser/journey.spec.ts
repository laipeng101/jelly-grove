import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import backups from "../../src/journey/backups.json" with { type: "json" };
import { createSession, playMove } from "../../src/journey/session";
import { candidate, certify } from "../../src/journey/generator";
import { solve } from "../../src/journey/solver";
import {
  emptyJourneySave,
  KEY,
  MAX_JOURNEY_SAVE_FILE_BYTES,
  parseJourneySave,
  serializeJourneySave,
} from "../../src/journey/storage";
import type {
  Puzzle,
  JourneySave,
  ThemeId,
  Move,
} from "../../src/journey/types";

const puzzle = (id: ThemeId) =>
  (backups as Puzzle[]).find((p) => p.themeId === id)!;
async function load(
  page: Page,
  id: ThemeId = 13,
  url = "/?play=lab",
  initial = puzzle(id),
) {
  const save = emptyJourneySave();
  save.session = createSession(initial);
  parseJourneySave(JSON.stringify(save));
  await page.addInitScript(
    ({ value, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { value: save, key: KEY },
  );
  await page.goto(url);
  await expect(page.locator("#trial-board")).toBeVisible();
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  return save.session.puzzle;
}
async function state(page: Page): Promise<JourneySave> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
}
async function play(page: Page, move: Move) {
  const previous = (await state(page)).session!.state.moves;
  await page.locator(`[data-trial-cell="${move.a.r},${move.a.c}"]`).click();
  await page.locator(`[data-trial-cell="${move.b.r},${move.b.c}"]`).click();
  await expect
    .poll(async () => (await state(page)).session!.state.moves)
    .toBe(previous + 1);
  await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
}
async function checkTrialLayout(
  page: Page,
  fullBoard: boolean,
  info?: TestInfo,
) {
  const inspect = () =>
    page.evaluate(
      ({ fullBoard }) => {
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
          fullBoard &&
          (!inside(sr, vr) ||
            viewport.scrollHeight > viewport.clientHeight + 1 ||
            viewport.scrollWidth > viewport.clientWidth + 1)
        )
          issues.push("board including outer route gutter needs scrolling");
        document
          .querySelectorAll<HTMLElement>("[data-trial-cell]")
          .forEach((e) => {
            const r = e.getBoundingClientRect();
            if (r.width < 43.9 || r.height < 43.9)
              issues.push("tile below 44px");
            if (fullBoard) check(e, false);
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
        return {
          issues,
          viewport: bounds,
          board: { width: sr.width, height: sr.height },
          scroll: {
            client: viewport.clientHeight,
            content: viewport.scrollHeight,
          },
        };
      },
      { fullBoard },
    );
  await expect.poll(async () => (await inspect()).issues).toEqual([]);
  const report = await inspect();
  if (info) {
    await info.attach("current-viewport-layout", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath("trial-current-viewport.png"),
      fullPage: false,
    });
  }
}

for (const id of [13, 14, 15, 16, 17, 18] as const) {
  for (const kind of ["challenge", "ordinary"] as const)
    test(`${id} ${kind}: interface witness and final undo`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const p = await load(page, id);
      for (const move of p.proof[kind]) await play(page, move);
      await expect(page.getByRole("status")).toContainText("送达完成");
      const final = (await state(page)).session!;
      expect(final.state.phase).toBe("won");
      expect((await state(page)).best[id]).toBe(kind === "challenge" ? 3 : 2);
      await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
      expect((await state(page)).session!.state.phase).toBe("playing");
      await play(page, p.proof[kind].at(-1)!);
      expect((await state(page)).session!.state.score).toBe(final.state.score);
      expect(errors).toEqual([]);
    });
}

test("preview, hints, retry and refresh obey persistence contract", async ({
  page,
}) => {
  const p = await load(page);
  const before = (await state(page)).session!;
  await page.getByRole("button", { name: "下一拍", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "下一拍位置预览" }),
  ).toBeVisible();
  expect((await state(page)).session).toEqual(before);
  await page.getByRole("button", { name: "返回棋盘" }).click();
  await play(page, p.proof.challenge[0]);
  await page.getByRole("button", { name: "解题提示", exact: true }).click();
  expect((await state(page)).session!.hintLevel).toBe(0);
  await page.getByRole("button", { name: "使用提示 · 展开主题思路" }).click();
  await page.getByRole("button", { name: "展开本盘关键关系" }).click();
  await page.getByRole("button", { name: "展开本盘完整解法" }).click();
  await expect(
    page.getByText("3 · 从初盘开始的完整解法", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "重试本盘", exact: true }).click();
  await page.getByRole("button", { name: "确认重试", exact: true }).click();
  expect((await state(page)).session!.hintLevel).toBe(3);
  expect((await state(page)).session!.state.moves).toBe(0);
  await play(page, p.proof.challenge[0]);
  const saved = await state(page);
  await page.reload();
  await expect(page.locator("#trial-board")).toBeVisible();
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  expect(await state(page)).toEqual(saved);
  await page.keyboard.press("z");
  expect((await state(page)).session!.hintLevel).toBe(3);
  expect((await state(page)).session!.state.moves).toBe(0);
});

test("hint alternatives name the same starting position even when a rejected first choice is a valid second step", async ({
  page,
}) => {
  // This seed was misread in blind play: B loses at the start, but A then B wins.
  const p = candidate(18, 1582689130);
  expect(certify(p, solve(p))).toBe(true);
  const branch = p.proof.critical[0];
  expect(branch.prefix).toEqual([]);
  expect(branch.good).toEqual(p.proof.challenge[0]);
  expect(branch.bad).toEqual(p.proof.challenge[1]);
  await load(page, 18, "/?play=lab", p);
  await page.getByRole("button", { name: "解题提示", exact: true }).click();
  await page.getByRole("button", { name: "使用提示 · 展开主题思路" }).click();
  await page.getByRole("button", { name: "展开本盘关键关系" }).click();
  const relation = page.locator(".trial-hint-choices").first();
  await expect(relation).toContainText("两者都从此时的棋盘出发");
  await expect(relation.locator("p").nth(1)).toContainText(
    "选项 A：2行1列 ↔ 2行3列。这样做仍有机会完成本盘挑战",
  );
  await expect(relation.locator("p").nth(2)).toContainText(
    "选项 B：1行1列 ↔ 1行4列。这个选择之后没有通关解",
  );
  await page.getByRole("button", { name: "展开本盘完整解法" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "本盘已用提示，仍会失去“不用提示”星",
  );
  await page.keyboard.press("Escape");
  for (const action of p.proof.challenge) await play(page, action);
  await expect(page.locator(".trial-feedback")).toContainText("★★☆");
  expect((await state(page)).session!.state.phase).toBe("won");
});

test("360x640 touch layout, keyboard and dialog focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await load(page, 17);
  const tiles = await page
    .locator("[data-trial-cell]")
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          right: r.right,
        };
      }),
    );
  for (const tile of tiles) {
    expect(tile.width).toBeGreaterThanOrEqual(44);
    expect(tile.height).toBeGreaterThanOrEqual(44);
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.right).toBeLessThanOrEqual(360);
    expect(tile.bottom).toBeLessThanOrEqual(640);
  }
  const layout = await page
    .locator(".trial-board-viewport")
    .evaluate((e) => ({ height: e.clientHeight, scroll: e.scrollHeight }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.height + 1);
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
  await checkTrialLayout(page, true, testInfo);
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
  }, info) => {
    await page.setViewportSize({ width, height });
    await load(page, 17);
    if (!fullBoard) {
      await checkScrollableTrial(page, info, false);
      return;
    }
    await checkTrialLayout(page, fullBoard, info);
    await page.getByRole("button", { name: "下一拍", exact: true }).click();
    await checkTrialLayout(page, fullBoard);
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

async function checkScrollableTrial(
  page: Page,
  info: TestInfo,
  enlarged = true,
) {
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
  await expect(page.locator(".trial-seed")).toBeVisible();
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
  await expect(page.locator(".trial-star-rules")).toBeVisible();
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
    await page.screenshot({
      path: info.outputPath(`large-text-${edge}-fruit.png`),
    });
    await fruit.click();
    await expect(fruit).toHaveAttribute("aria-pressed", "false");
  }
  await page.getByRole("button", { name: "下一拍", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "下一拍位置预览" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回棋盘", exact: true }).click();
  await page.getByRole("button", { name: "玩法说明", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const layout = await boardViewport.evaluate((e) => ({
    board: { height: e.clientHeight, scrollHeight: e.scrollHeight },
    card: {
      height: e.parentElement!.clientHeight,
      scrollHeight: e.parentElement!.scrollHeight,
    },
    width: {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    },
  }));
  expect(layout.width.document).toBeLessThanOrEqual(layout.width.viewport + 1);
  await info.attach("large-text-scroll-layout", {
    body: JSON.stringify(layout, null, 2),
    contentType: "application/json",
  });
}

for (const id of [13, 14, 15, 16, 17, 18] as const) {
  for (const mode of ["root", "visible"] as const) {
    test(`${id} 200 percent ${mode} type at 360x640: scroll to goals, actions and both board edges`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await load(page, id);
      await checkTrialLayout(page, true);
      await enlargeTrialText(page, mode);
      await checkScrollableTrial(page, info);
    });
  }
}

test("200 percent root type at 390x700: scrollable card keeps controls and fruit reachable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await load(page, 17);
  await enlargeTrialText(page, "root");
  await checkScrollableTrial(page, info);
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
      let painted = 0,
        covered = 0,
        centerCovered = 0;
      for (let index = 3; index < fruitPixels.length; index += 4) {
        if (fruitPixels[index] < 64) continue;
        painted++;
        if (markerPixels[index] < 64) continue;
        covered++;
        const x = ((index - 3) / 4) % width,
          y = Math.floor((index - 3) / 4 / width);
        const u = ((x / scale - (rect.x - tile.x)) / rect.width) * 64,
          v = ((y / scale - (rect.y - tile.y)) / rect.height) * 64;
        if (u >= 16 && u <= 48 && v >= 22 && v <= 53) centerCovered++;
      }
      if (!painted) errors.push("fruit has no visible artwork");
      if (covered) errors.push("marker covers fruit artwork");
      results.push({
        coordinate: cell.dataset.trialCell,
        fruit: cell.dataset.fruit,
        tile: { width: tile.width, height: tile.height },
        fruitSize: { width: rect.width, height: rect.height },
        painted,
        covered,
        centerCovered,
        errors,
      });
    }
    return results;
  });
}

const overlayEvidence = resolve("output/journey/repair-overlay");
async function recordTrackArtwork(page: Page, name: string, info: TestInfo) {
  const report = await inspectTrackArtwork(page);
  expect(report.length).toBeGreaterThan(0);
  expect(
    report.flatMap((cell) =>
      cell.errors.map((error) => `${cell.coordinate}: ${error}`),
    ),
  ).toEqual([]);
  await mkdir(overlayEvidence, { recursive: true });
  await writeFile(
    resolve(overlayEvidence, `${name}.json`),
    JSON.stringify(report, null, 2),
  );
  await info.attach(`${name}-artwork`, {
    body: JSON.stringify(report),
    contentType: "application/json",
  });
  if (name.endsWith("-initial")) {
    await page.locator(".trial-card").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: resolve(overlayEvidence, `${name}-header.png`),
    });
  }
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
  for (const edge of ["top", "bottom"] as const) {
    await page.locator(".trial-board-viewport").evaluate((element, edge) => {
      element.scrollTop = edge === "top" ? 0 : element.scrollHeight;
      element.scrollIntoView({ block: "center" });
    }, edge);
    await page.screenshot({
      path: resolve(overlayEvidence, `${name}-${edge}.png`),
    });
  }
}

for (const id of [13, 14, 15, 16, 17, 18] as const) {
  for (const mode of ["normal", "root", "visible"] as const) {
    test(`${id} ${mode} artwork: all track fruit remain visible through redraws`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: 360, height: 640 });
      const initial = id === 17 ? candidate(17, 556785146) : puzzle(id);
      if (id === 17) expect(certify(initial, solve(initial))).toBe(true);
      const p = await load(page, id, "/?play=lab", initial);
      if (mode !== "normal") await enlargeTrialText(page, mode);
      else await checkTrialLayout(page, true);
      const prefix = `${id}-${mode}`;
      await recordTrackArtwork(page, `${prefix}-initial`, info);
      const selected = page
        .locator(".trial-cell.on-track.trial-port:not(:disabled)")
        .first();
      const target = (await selected.count())
        ? selected
        : page.locator(".trial-cell.on-track:not(:disabled)").first();
      await target.click();
      await expect(target).toHaveAttribute("aria-pressed", "true");
      await recordTrackArtwork(page, `${prefix}-selected`, info);
      await page.getByRole("button", { name: "下一拍", exact: true }).click();
      await expect(page.locator(".trial-preview")).toBeVisible();
      await recordTrackArtwork(page, `${prefix}-preview`, info);
      await page.getByRole("button", { name: "返回棋盘", exact: true }).click();
      await play(page, p.proof.challenge[0]);
      await recordTrackArtwork(page, `${prefix}-moved`, info);
      await page.getByRole("button", { name: "撤销", exact: false }).click();
      await expect
        .poll(async () => (await state(page)).session!.state.moves)
        .toBe(0);
      const restored = await inspectTrackArtwork(page);
      expect(restored.flatMap((cell) => cell.errors)).toEqual([]);
      if (mode !== "normal") await checkScrollableTrial(page, info);
      for (const selector of [
        ".trial-star",
        ".trial-legend",
        ".trial-seed",
        "#trial-save",
      ]) {
        const element = page.locator(selector);
        await element.scrollIntoViewIfNeeded();
        await expect(element).toBeInViewport({ ratio: 0.99 });
      }
      await page.screenshot({
        path: resolve(overlayEvidence, `${prefix}-footer.png`),
      });
      expect(pageErrors).toEqual([]);
    });
  }
}

for (const mode of ["normal", "root", "visible"] as const) {
  test(`${mode} short screen keeps challenge, legend, seed and storage failure reachable`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 540 });
    const p = await load(page, 17);
    if (mode !== "normal") await enlargeTrialText(page, mode);
    await checkScrollableTrial(page, info, mode !== "normal");
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      };
    });
    // A real move triggers persist() and the failure status, not a DOM-only fixture.
    for (const point of [p.proof.challenge[0].a, p.proof.challenge[0].b])
      await page.locator(`[data-trial-cell="${point.r},${point.c}"]`).click();
    await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
    const status = page.locator("#trial-save");
    await expect(status).toHaveText("存储不可用，请导出");
    await status.scrollIntoViewIfNeeded();
    await expect(status).toBeInViewport({ ratio: 0.99 });
    expect(
      await status.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await mkdir(overlayEvidence, { recursive: true });
    await page.screenshot({
      path: resolve(overlayEvidence, `short-${mode}-storage-failure.png`),
    });
  });
}

test("thinking time never decays earned combo or juice", async ({ page }) => {
  const p = await load(page, 17);
  await play(page, p.proof.challenge[0]);
  const before = (await state(page)).session!.state;
  await page.clock.install();
  await page.clock.fastForward(120_000);
  expect((await state(page)).session!.state).toEqual(before);
});

test("invalid import never changes current game; export can round-trip", async ({
  page,
}) => {
  await load(page, 14);
  const before = await state(page);
  await page.getByRole("button", { name: "音效与设置" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出试玩进度", exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator("#trial-import").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(page.getByRole("dialog")).toContainText("无法导入");
  expect(await state(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "音效与设置" }).click();
  await page.locator("#trial-import").setInputFiles(path!);
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  expect(await state(page)).toEqual(before);
});

test("large Unicode progress imports, downloads and reimports without losing history or sticky hints", async ({
  page,
}, testInfo) => {
  await load(page, 13);
  const imported = emptyJourneySave();
  imported.session = createSession(puzzle(18), 2);
  for (const action of imported.session.puzzle.proof.challenge.slice(0, 2)) {
    expect(playMove(imported.session, action).ok).toBe(true);
  }
  imported.best = { 13: 2, 14: 3, 18: 2 };
  imported.recent = [imported.session.puzzle.id];
  imported.hinted = Array.from(
    { length: 6000 },
    (_, i) => "果".repeat(294) + String(i).padStart(6, "0"),
  );
  const expectedExport = serializeJourneySave(imported);
  // Previously exported, indented backups remain readable as well as new compact ones.
  const importText = JSON.stringify(imported, null, 2);
  const inputBytes = Buffer.byteLength(importText, "utf8");
  expect(inputBytes).toBeGreaterThan(5_000_000);
  expect(inputBytes).toBeLessThanOrEqual(MAX_JOURNEY_SAVE_FILE_BYTES);
  await page.getByRole("button", { name: "音效与设置" }).click();
  await page.locator("#trial-import").setInputFiles({
    name: "unicode-progress.json",
    mimeType: "application/json",
    buffer: Buffer.from(importText, "utf8"),
  });
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  expect(await state(page)).toEqual(imported);
  await page.getByRole("button", { name: "音效与设置" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出试玩进度", exact: true }).click();
  const download = await downloadEvent;
  const downloadedPath = testInfo.outputPath("unicode-progress-export.json");
  await download.saveAs(downloadedPath);
  const downloaded = await readFile(downloadedPath, "utf8");
  expect(downloaded).toBe(expectedExport);
  expect(parseJourneySave(downloaded)).toEqual(imported);
  await page.locator("#trial-import").setInputFiles(downloadedPath);
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  expect(await state(page)).toEqual(imported);
  await page.reload();
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  expect(await state(page)).toEqual(imported);
  expect((await state(page)).session!.history).toHaveLength(2);
  await testInfo.attach("unicode-transfer-metrics", {
    body: JSON.stringify({
      inputBytes,
      exportBytes: Buffer.byteLength(downloaded, "utf8"),
      characters: downloaded.length,
      hinted: imported.hinted.length,
      history: imported.session.history.length,
      hintLevel: imported.session.hintLevel,
      best: imported.best,
    }),
    contentType: "application/json",
  });
  await page.screenshot({
    path: testInfo.outputPath("unicode-transfer-restored.png"),
  });
});

test("export stays available after a storage failure and reports download errors without losing progress", async ({
  page,
}, testInfo) => {
  await load(page, 14);
  const before = await state(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "音效与设置" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出试玩进度", exact: true }).click();
  const downloadedPath = testInfo.outputPath("storage-unavailable-export.json");
  await (await downloadEvent).saveAs(downloadedPath);
  expect(parseJourneySave(await readFile(downloadedPath, "utf8"))).toEqual(
    before,
  );
  expect(await state(page)).toEqual(before);
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("下载暂不可用");
    };
  });
  await page.getByRole("button", { name: "导出试玩进度", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("无法导出这份进度");
  await expect(page.getByRole("dialog")).toContainText("下载暂不可用");
  expect(await state(page)).toEqual(before);
});

test("denied startup storage offers recovery guidance and still exports new in-memory progress", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const original = "unreadable original progress";
  await page.addInitScript(
    ({ key, original }) => {
      const read = Storage.prototype.getItem;
      const write = Storage.prototype.setItem;
      localStorage.setItem(key, original);
      Storage.prototype.getItem = function (name) {
        if (name === key)
          throw new DOMException("Read denied", "SecurityError");
        return read.call(this, name);
      };
      Storage.prototype.setItem = function (name, value) {
        if (name === key)
          throw new DOMException("Write denied", "SecurityError");
        return write.call(this, name, value);
      };
      Object.assign(window, {
        peekOriginal: () => read.call(localStorage, key),
      });
    },
    { key: KEY, original },
  );
  await page.goto("/?play=lab");
  await expect(page.getByRole("dialog")).toContainText("本地存储权限");
  await expect(page.getByRole("dialog")).toContainText("暂时无法导出原文件");
  await expect(
    page.getByRole("button", { name: "导出原存档", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "开始新的试玩", exact: true }).click();
  await expect(page.locator("#trial-board")).toBeVisible();
  await expect(page.locator("#trial-save")).toContainText("存储不可用");
  await page.getByRole("button", { name: "音效与设置" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出试玩进度", exact: true }).click();
  const path = testInfo.outputPath("denied-storage-new-progress.json");
  await (await downloadEvent).saveAs(path);
  expect(parseJourneySave(await readFile(path, "utf8")).session).toBeTruthy();
  expect(
    await page.evaluate(() =>
      (window as unknown as { peekOriginal: () => string }).peekOriginal(),
    ),
  ).toBe(original);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("denied-storage-recovered.png"),
  });
});

test("damaged original backup retains exact bytes when subsequent storage reads are denied", async ({
  page,
}, testInfo) => {
  const original = '{\r\n  "损坏🍊": true,\r\n';
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, original }) => {
      localStorage.setItem(key, original);
      const read = Storage.prototype.getItem;
      let readCount = 0;
      Storage.prototype.getItem = function (name) {
        if (name === key && ++readCount > 1)
          throw new DOMException("Later read denied", "SecurityError");
        return read.call(this, name);
      };
      Object.assign(window, { recoveryReads: () => readCount });
    },
    { key: KEY, original },
  );
  await page.goto("/?play=lab");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出原存档", exact: true }).click();
  const path = testInfo.outputPath("damaged-original.json");
  await (await downloadEvent).saveAs(path);
  expect(await readFile(path)).toEqual(Buffer.from(original));
  expect(
    await page.evaluate(() =>
      (window as unknown as { recoveryReads: () => number }).recoveryReads(),
    ),
  ).toBe(1);
  await expect(page.getByRole("alert")).toContainText("已发起原存档下载");
  expect(errors).toEqual([]);
});

test("damaged original download failures give feedback and allow an exact backup retry", async ({
  page,
}, testInfo) => {
  const original = '{"damaged": "原进度🍇", ';
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, original }) => localStorage.setItem(key, original),
    { key: KEY, original },
  );
  await page.goto("/?play=lab");
  await page.evaluate(() => {
    const createURL = URL.createObjectURL;
    const click = HTMLAnchorElement.prototype.click;
    Object.assign(window, {
      restoreDownload: () => {
        URL.createObjectURL = createURL;
        HTMLAnchorElement.prototype.click = click;
      },
    });
    URL.createObjectURL = () => {
      throw new Error("文件下载暂不可用");
    };
  });
  const exportButton = page.getByRole("button", {
    name: "导出原存档",
    exact: true,
  });
  await exportButton.click();
  await expect(page.getByRole("alert")).toContainText("文件下载暂不可用");
  await expect(page.getByRole("alert")).toContainText("可以重试");
  await page.evaluate(() => {
    (window as unknown as { restoreDownload: () => void }).restoreDownload();
    HTMLAnchorElement.prototype.click = () => {
      throw new Error("下载触发失败");
    };
  });
  await exportButton.click();
  await expect(page.getByRole("alert")).toContainText("下载触发失败");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    original,
  );
  await page.evaluate(() =>
    (window as unknown as { restoreDownload: () => void }).restoreDownload(),
  );
  const downloadEvent = page.waitForEvent("download");
  await exportButton.click();
  const path = testInfo.outputPath("retried-original.json");
  await (await downloadEvent).saveAs(path);
  expect(await readFile(path)).toEqual(Buffer.from(original));
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    original,
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("original-backup-retried.png"),
  });
});

test("offline file starts a new worker puzzle with no network", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.setOffline(true);
  await page.goto(
    pathToFileURL(resolve("dist/果冻果园.html")).href + "?play=lab",
  );
  await expect(page.locator("#trial-board")).toBeVisible({ timeout: 10_000 });
  await page.locator(".trial-theme-button").click();
  await page.getByRole("button", { name: /18 · 综合送达/ }).click();
  await expect(page.locator(".trial-theme-button")).toContainText(
    "18 · 综合送达",
    { timeout: 10_000 },
  );
  await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test("classic compact menu reaches trial without global event errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "切换游戏模式", exact: true }).click();
  await page
    .getByRole("link", { name: "新关卡试玩 · 流转送达", exact: true })
    .click();
  await expect(page.locator("#trial-board")).toBeVisible({ timeout: 10_000 });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  expect(errors).toEqual([]);
});

test("incompatible stored version is preserved until a new puzzle is chosen", async ({
  page,
}) => {
  const original = '{"version":999}';
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: KEY, value: original },
  );
  await page.goto("/?play=lab");
  await expect(page.getByRole("dialog")).toContainText(
    "发现需要处理的试玩存档",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    original,
  );
});
