import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  LEVELS,
  generateBoard,
  remaining,
  seedRandom,
  findPairs,
  type Level,
} from "../../src/engine";
import { commitMatch } from "../../src/game";
import { parseSave, type Game, type Mode, type Save } from "../../src/storage";

export function fixture(mode: Mode, level = 17, difficulty = 2, matches = 0) {
  const config: Level =
    mode === "journey"
      ? LEVELS[level - 1]
      : {
          ...LEVELS[difficulty === 0 ? 2 : difficulty === 1 ? 7 : 16],
          gravity: mode === "free" && difficulty === 2,
        };
  const board = generateBoard(config, seedRandom(42));
  const game: Game = {
    mode,
    level,
    difficulty,
    seed: 42,
    board,
    score: 0,
    cleared: 0,
    total: remaining(board),
    combo: 0,
    bestCombo: 0,
    juice: 0,
    fever: 0,
    lastMatch: 0,
    assists: 0,
    elapsed: 0,
    timeLeft: 120000,
    round: 1,
    phase: "playing",
    history: [],
  };
  for (let i = 0; i < matches; i++) {
    const pair = findPairs(game.board, 1)[0];
    if (!pair) throw new Error("Fixture needs a valid match");
    commitMatch(game, pair, config, seedRandom(100 + i));
  }
  const save: Save = {
    version: 1,
    mode,
    stars: Array(24).fill(3),
    best: 12000,
    freeBest: 12000,
    totalPairs: matches,
    settings: { sound: false, motion: false, volume: 0.8 },
    sessions: { [mode]: game },
  };
  return { save, game, config };
}

export async function loadGame(page: Page, save: Save, url = "/") {
  parseSave(JSON.stringify(save)); // Test states must obey the real import contract.
  await page.addInitScript(
    (value) =>
      localStorage.setItem("jelly-grove.save.v1", JSON.stringify(value)),
    save,
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto(url);
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  await settle(page);
}

export async function settle(page: Page) {
  // Browser resize/media-query events arrive asynchronously, outside the mocked
  // game clock. Wait for the layout to observe the new viewport before auditing.
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return page.evaluate(() => {
        const compact = matchMedia(
          "(max-width: 870px), (max-height: 620px) and (pointer: coarse)",
        ).matches;
        return (
          document.documentElement.classList.contains("compact-play") ===
            compact &&
          (!compact ||
            Math.abs(
              document.body.getBoundingClientRect().height -
                visualViewport!.height,
            ) < 1)
        );
      });
    })
    .toBe(true);
  await page.clock.runFor(50);
}

// Visibility assertions must check the viewport AND the painted element on top.
// Playwright's toBeVisible alone accepts an offscreen/covered element.
export async function checkLayout(
  page: Page,
  fullBoard: boolean,
  info?: TestInfo,
) {
  await settle(page);
  const report = await page.evaluate(
    ({ fullBoard }) => {
      const errors: string[] = [];
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const view = window.visualViewport!;
      const bounds = {
        left: view.offsetLeft,
        top: view.offsetTop,
        right: view.offsetLeft + view.width,
        bottom: view.offsetTop + view.height,
      };
      const inside = (a: ReturnType<typeof rect>, b: typeof bounds) =>
        a.left >= b.left - 1 &&
        a.top >= b.top - 1 &&
        a.right <= b.right + 1 &&
        a.bottom <= b.bottom + 1;
      const mustSee = (el: HTMLElement) => {
        const r = rect(el),
          name = el.id || el.className;
        if (!inside(r, bounds) || r.width === 0 || r.height === 0)
          errors.push(`${name} outside viewport`);
        const cx = r.left + r.width / 2,
          cy = r.top + r.height / 2;
        // Sample a cross inside the painted shape, not transparent rounded corners.
        for (const [x, y] of [
          [cx, r.top + Math.min(8, r.height / 4)],
          [cx, r.bottom - Math.min(8, r.height / 4)],
          [r.left + Math.min(8, r.width / 4), cy],
          [r.right - Math.min(8, r.width / 4), cy],
          [cx, cy],
        ]) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || (hit !== el && !el.contains(hit)))
            errors.push(`${name} covered by ${hit?.tagName}.${hit?.className}`);
        }
        if (
          el.scrollWidth > el.clientWidth + 1 ||
          el.scrollHeight > el.clientHeight + 1
        )
          errors.push(`${name} text clipped`);
      };
      for (const selector of [
        "#primary-stat",
        "#secondary-stat",
        "#compact-objective",
        "#combo-label",
        "#mini-juice-label",
        "#combo-window",
        "#mini-juice-fill",
        ".compact-mode",
        ".compact-more",
        ".pause-btn",
        ".tool-button",
      ]) {
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          // Progress fills can legitimately have zero width. Check the full track instead.
          mustSee(
            selector.endsWith("-fill") || selector === "#combo-window"
              ? el.parentElement!
              : el,
          );
        }
      }
      const viewport = document.querySelector<HTMLElement>(".board-viewport")!;
      const board = document.querySelector<HTMLElement>(".board")!;
      const meters = document.querySelector<HTMLElement>(".play-meters")!;
      const tools = document.querySelector<HTMLElement>(".tools")!;
      const v = rect(viewport),
        b = rect(board),
        m = rect(meters),
        t = rect(tools);
      if (m.bottom > v.top + 1 || v.bottom > t.top + 1)
        errors.push("HUD, board and tools overlap");
      if (
        fullBoard &&
        (!inside(b, v) ||
          viewport.scrollHeight > viewport.clientHeight + 1 ||
          viewport.scrollWidth > viewport.clientWidth + 1)
      )
        errors.push("full board requires scrolling");
      const tiles = [...document.querySelectorAll<HTMLElement>(".fruit-tile")];
      for (const tile of tiles) {
        const r = rect(tile);
        if (r.width < 43.9 || r.height < 43.9) errors.push("tile below 44px");
        if (fullBoard) mustSee(tile);
      }
      for (const button of document.querySelectorAll<HTMLElement>(
        ".game-card-top button, .tool-button",
      )) {
        const r = rect(button);
        if (
          getComputedStyle(button).display !== "none" &&
          (r.width < 43.9 || r.height < 43.9)
        )
          errors.push("control below 44px");
      }
      for (const label of document.querySelectorAll<HTMLElement>(
        ".score-strip span, #combo-label, #mini-juice-label",
      )) {
        if (
          label.getClientRects().length &&
          parseFloat(getComputedStyle(label).fontSize) < 12
        )
          errors.push("critical text below 12px");
      }
      if (
        document.documentElement.scrollWidth > innerWidth + 1 ||
        document.body.scrollHeight > innerHeight + 1 ||
        window.scrollY !== 0
      )
        errors.push("page overflow instead of board scroll");
      return {
        viewport: bounds,
        board: b,
        meters: m,
        tools: t,
        boardScroll: {
          height: viewport.scrollHeight,
          clientHeight: viewport.clientHeight,
        },
        tile: tiles[0] ? rect(tiles[0]) : null,
        errors,
      };
    },
    { fullBoard },
  );
  if (info) {
    await info.attach("layout-geometry", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    await info.attach("viewport", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }
  expect(report.errors, JSON.stringify(report, null, 2)).toEqual([]);
  return report;
}
