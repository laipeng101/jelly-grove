import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { candidate, certify } from "../../../src/journey/generator";
import { solve } from "../../../src/journey/solver";
import { load, play, state } from "./fixtures";

for (const id of [13, 14, 15, 16, 17, 18] as const) {
  for (const kind of ["challenge", "ordinary"] as const)
    test(`${id} ${kind}: interface witness and final undo`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const p = await load(page, { theme: id });
      for (const move of p.proof[kind]) await play(page, move);
      await expect(page.getByRole("status")).toContainText("送达完成");
      const final = (await state(page)).session!;
      expect(final.state.phase).toBe("won");
      expect((await state(page)).best[id]).toBe(kind === "challenge" ? 3 : 2);
      await page.locator("#trial-result-stay").click();
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
  await page.getByRole("button", { name: "使用提示 · 展开主题思路" }).click();
  await page.getByRole("button", { name: "展开本盘关键关系" }).click();
  const relation = page.locator(".trial-hint-choices").first();
  await expect(relation).toContainText("以下两种选项都以初盘为准");
  await expect(relation.locator("p").nth(1)).toContainText(
    "选项 A：2行1列 ↔ 2行3列。这样做仍有机会完成本盘挑战",
  );
  await expect(relation.locator("p").nth(2)).toContainText(
    "选项 B：1行1列 ↔ 1行4列。这个选择之后没有通关解",
  );
  await page.getByRole("button", { name: "展开本盘完整解法" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "本盘已用提示，无法获得“不用提示”星",
  );
  await page.keyboard.press("Escape");
  for (const action of p.proof.challenge) await play(page, action);
  await expect(page.locator(".trial-feedback")).toContainText("★★☆");
  expect((await state(page)).session!.state.phase).toBe("won");
});

test('second hint identifies the replay position after a move has been made', async ({ page }) => {
  const puzzle = candidate(13, 988634891);
  expect(certify(puzzle, solve(puzzle))).toBe(true);
  await load(page, { initial: puzzle });
  await play(page, puzzle.proof.critical[0].bad);
  await page.getByRole('button', { name: '解题提示', exact: true }).click();
  await page.getByRole('button', { name: '使用提示 · 展开主题思路' }).click();
  await page.getByRole('button', { name: '展开本盘关键关系' }).click();
  await expect(page.getByRole('dialog')).toContainText('以下坐标用于复盘');
  const relation = page.locator('.trial-hint-choices').first();
  await expect(relation).toContainText('初盘');
  expect((await state(page)).session!.state.moves).toBe(1);
});


test("thinking time never decays earned combo or juice", async ({ page }) => {
  const p = await load(page, { theme: 17 });
  await play(page, p.proof.challenge[0]);
  const before = (await state(page)).session!.state;
  await page.clock.install();
  await page.clock.fastForward(120_000);
  expect((await state(page)).session!.state).toEqual(before);
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
  await page.getByRole("button", { name: /18 · 综合送达/ }).click();
  await expect(page.locator(".trial-theme-button")).toContainText(
    "18 · 综合送达",
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
    .getByRole("link", { name: "新关卡试玩 · 流转送达", exact: true })
    .click();
  await expect(page.locator("#trial-board")).toBeVisible({ timeout: 10_000 });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  expect(errors).toEqual([]);
});
