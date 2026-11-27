import { expect, type Page } from "@playwright/test";
import backups from "../../../src/journey/generated/backups.json" with { type: "json" };
import { createSession } from "../../../src/journey/session";
import { emptyJourneySave, KEY } from "../../../src/journey/storage";
import type { Puzzle, JourneySave, ThemeId, Move } from "../../../src/journey/types";
import type { Save } from "../../../src/storage";

export const puzzle = (id: ThemeId) =>
  (backups as Puzzle[]).find((p) => p.themeId === id)!;

type LoadOptions = {
  theme?: ThemeId;
  initial?: Puzzle;
  motion?: boolean;
  url?: string;
  best?: JourneySave["best"];
};

export async function load(
  page: Page,
  { theme = 13, initial = puzzle(theme), motion, url = "/?play=lab", best = {} }: LoadOptions = {},
) {
  const save = emptyJourneySave();
  save.session = createSession(initial);
  save.best = best;
  const value = JSON.stringify(save);
  const preferences: Save | undefined = motion === undefined ? undefined : {
    version: 1,
    mode: "journey",
    stars: Array(24).fill(0),
    best: 0,
    freeBest: 0,
    totalPairs: 0,
    sessions: {},
    settings: { sound: false, motion, volume: 0.8 },
  };
  const seed = await page.addInitScript(
    ({ value, key, preferences }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      if (preferences)
        localStorage.setItem("jelly-grove.save.v1", JSON.stringify(preferences));
    },
    { value, key: KEY, preferences },
  );
  await page.goto(url);
  await seed.dispose();
  await expect(page.locator("#trial-board")).toBeVisible();
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  return save.session.puzzle;
}
export async function state(page: Page): Promise<JourneySave> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
}

export async function session(page: Page) {
  return (await state(page)).session!;
}

export async function play(page: Page, move: Move, { waitForMotion = true } = {}) {
  const preview = page.locator('[data-trial="preview"]');
  await expect(preview).toBeEnabled();
  const previous = (await session(page)).state.moves;
  await page.locator(`[data-trial-cell="${move.a.r},${move.a.c}"]`).click();
  await page.locator(`[data-trial-cell="${move.b.r},${move.b.c}"]`).click();
  await expect
    .poll(async () => (await session(page)).state.moves)
    .toBe(previous + 1);
  if (waitForMotion) await expect(preview).toBeEnabled();
}
