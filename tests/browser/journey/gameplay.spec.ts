import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pauseBrowserClock } from "../clock";
import { candidate, certify } from "../../../src/journey/generator";
import { solve } from "../../../src/journey/solver";
import { load, play, state } from "./fixtures";

for (const [theme, kind] of [[13, "challenge"], [18, "ordinary"]] as const) {
  test(`theme ${theme} ${kind}: finishing again after undo preserves the result`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const puzzle = await load(page, { theme });
    for (const move of puzzle.proof[kind]) await play(page, move);
    await expect(page.getByRole("status")).toContainText("送达完成");
    const final = (await state(page)).session!;
    expect(final.state.phase).toBe("won");
    expect((await state(page)).best[theme]).toBe(kind === "challenge" ? 3 : 2);
    await page.locator("#trial-result-stay").click();
    await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
    expect((await state(page)).session!.state.phase).toBe("playing");
    await play(page, puzzle.proof[kind].at(-1)!);
    expect((await state(page)).session!.state.score).toBe(final.state.score);
    expect(errors).toEqual([]);
  });
}

test("preview, hints, retry and refresh obey persistence contract", async ({
  page,
}) => {
  const p = await load(page);
  const before = (await state(page)).session!;
  await page.getByRole("button", { name: "预览轨道移动", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "轨道位置预览" }),
  ).toBeVisible();
  expect((await state(page)).session).toEqual(before);
  await page.getByRole("button", { name: "返回棋盘" }).click();
  await play(page, p.proof.challenge[0]);
  await page.getByRole("button", { name: "解题提示", exact: true }).click();
  expect((await state(page)).session!.hintLevel).toBe(0);
  await page.getByRole("button", { name: "查看主题提示" }).click();
  await page.getByRole("button", { name: "对比两种配法" }).click();
  await page.getByRole("button", { name: "查看完整解法" }).click();
  await expect(
    page.getByText("3 · 完整解法", { exact: true }),
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
  await load(page, { initial: p });
  await page.getByRole("button", { name: "解题提示", exact: true }).click();
  await page.getByRole("button", { name: "查看主题提示" }).click();
  await page.getByRole("button", { name: "对比两种配法" }).click();
  const relation = page.locator(".trial-hint-choices").first();
  await expect(relation).toContainText("在开局棋盘上比较下面两种配法");
  await expect(relation.locator("p").nth(1)).toContainText(
    "配法 A 2 行 1 列 ↔ 2 行 3 列。这样配仍有机会完成挑战",
  );
  await expect(relation.locator("p").nth(2)).toContainText(
    "配法 B 1 行 1 列 ↔ 1 行 4 列。这个选择之后没有通关解",
  );
  await page.getByRole("button", { name: "查看完整解法" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "本盘已用提示，无法获得“不用提示”星",
  );
  await page.keyboard.press("Escape");
  for (const action of p.proof.challenge) await play(page, action);
  await expect(page.locator(".trial-feedback")).toContainText("★★☆");
  expect((await state(page)).session!.state.phase).toBe("won");
});

test("comparing later choices lists the earlier moves regardless of the current board", async ({ page }) => {
  const puzzle = candidate(17, 681686203);
  expect(certify(puzzle, solve(puzzle))).toBe(true);
  await load(page, { initial: puzzle });
  await play(page, puzzle.proof.challenge[0]);
  await page.getByRole('button', { name: '解题提示', exact: true }).click();
  await page.getByRole('button', { name: '查看主题提示' }).click();
  await page.getByRole('button', { name: '对比两种配法' }).click();
  await expect(page.getByRole('dialog')).toContainText('请从开局棋盘开始');
  const relation = page.locator('.trial-hint-choices').first();
  await expect(relation).toContainText('先依次配对');
  await expect(relation).toContainText('完成这些步骤后，再比较下面两种配法');
  expect((await state(page)).session!.state.moves).toBe(1);
});


test("thinking time never decays earned combo or juice", async ({ page }) => {
  await pauseBrowserClock(page);
  const p = await load(page, { theme: 17 });
  await play(page, p.proof.challenge[0]);
  const stats = page.locator(".trial-stats");
  await expect(stats).toContainText("连消 1");
  await expect(stats).toContainText(/果汁 [1-9]\d*%/);
  const before = await stats.innerText();
  await page.clock.fastForward(120_000);
  await expect(stats).toHaveText(before, { useInnerText: true });
});

test("standalone trial opens and switches theme offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const network: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) network.push(request.url());
  });
  await context.setOffline(true);
  await page.goto(
    pathToFileURL(resolve("dist/果冻果园.html")).href + "?play=lab",
  );
  await expect(page.locator("#trial-board")).toBeVisible({ timeout: 10_000 });
  await page.locator(".trial-theme-button").click();
  await page.getByRole("button", { name: /综合送达/ }).click();
  await expect(page.locator(".trial-theme-button")).toContainText(
    "综合送达",
    { timeout: 10_000 },
  );
  await expect(page.locator('[data-trial="preview"]')).toBeEnabled();
  expect(network).toEqual([]);
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
    .getByRole("link", { name: "流转送达", exact: true })
    .click();
  await expect(page.locator("#trial-board")).toBeVisible({ timeout: 10_000 });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  expect(errors).toEqual([]);
});
