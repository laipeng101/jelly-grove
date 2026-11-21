import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { findPairs, remaining } from "../../../src/engine";
import { commitMatch } from "../../../src/game";
import { fixture, loadGame, checkLayout, settle } from "./fixtures";

// Exercise every HUD at the minimum full-board viewport. Use the largest
// board for the remaining compact width ranges.
for (const [mode, width, height] of [
  ["journey", 360, 640],
  ["free", 360, 640],
  ["sprint", 360, 640],
  ["journey", 620, 740],
  ["journey", 768, 1024],
  ["journey", 870, 720],
] as const) {
  test(`${mode} largest board fits ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { save } = fixture(mode, mode === "journey" ? 24 : 17);
    await loadGame(page, save);
    await checkLayout(page, true);
    await page.getByRole("button", { name: "提示", exact: true }).click();
    await checkLayout(page, true);
  });
}

for (const level of [1, 2, 3, 7, 13, 19]) {
  test(`journey board shape at level ${level}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await loadGame(page, fixture("journey", level).save);
    await checkLayout(page, true);
  });
}

test("live combo, expiry, fever and final seconds stay readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const { save, game } = fixture("sprint", 17, 2, 12);
  game.elapsed = 10000;
  game.lastMatch = 5000;
  game.fever = 9900;
  game.timeLeft = 9800;
  game.score = 999999;
  await loadGame(page, save);
  await expect(page.locator("#combo-label")).toContainText("12 连消");
  await expect(page.locator("#mini-juice-label")).toContainText("×2");
  await expect(page.locator("#primary-stat")).toHaveClass(/time-warning/);
  await checkLayout(page, true);
  const { a, b } = findPairs(game.board, 1)[0];
  for (const { r, c } of [a, b])
    await page.locator(`[data-cell="${r},${c}"]`).click();
  await settle(page);
  await expect(page.locator("#combo-label")).toContainText("13 连消");
  await page.clock.runFor(6000);
  await expect(page.locator("#combo-label")).toHaveText("当前连消 0");
  await expect(page.locator("#play-caption")).toHaveText(/^本次 \+\d+ 分$/);
  await checkLayout(page, true);
});

for (const [width, height] of [
  [320, 568],
  [390, 480],
  [740, 360],
  [932, 430],
]) {
  test(`short/landscape ${width}×${height} scrolls only the board`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadGame(page, fixture("sprint").save);
    await checkLayout(page, false);
    const scroller = page.locator(".board-viewport");
    expect(
      await scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    for (const position of [0.5, 1, 0]) {
      await scroller.evaluate((el, part) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) * part;
        el.scrollLeft = (el.scrollWidth - el.clientWidth) * part;
      }, position);
      await checkLayout(page, false);
    }
    // The last cell remains touchable after scrolling to it; this is deliberately
    // separate from full-board visibility, which these exceptional sizes waive.
    const last = page.locator(".fruit-tile").last();
    await last.click();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await checkLayout(page, false);
  });
}

test("200% text reflows HUD while keeping 44px cells", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await loadGame(page, fixture("journey", 24).save);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await checkLayout(page, false);
  await page.locator(".fruit-tile").last().click();
  await checkLayout(page, false);
});

test("available height changes, rotation and pause preserve live state", async ({
  page,
}) => {
  const { save } = fixture("sprint", 17, 2, 10);
  await loadGame(page, save);
  for (const [width, height, full] of [
    [390, 844, true],
    [390, 640, true],
    [844, 390, false],
    [390, 700, true],
  ] as const) {
    await page.setViewportSize({ width, height });
    await checkLayout(page, full);
  }
  await page.getByRole("button", { name: "暂停游戏" }).click();
  await expect(page.getByRole("dialog")).toContainText("进度已保存");
  const combo = await page.locator("#combo-label").textContent();
  const time = await page.locator("#primary-stat").textContent();
  await page.clock.runFor(20000);
  await expect(page.locator("#combo-label")).toHaveText(combo!);
  await expect(page.locator("#primary-stat")).toHaveText(time!);
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  await checkLayout(page, true);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "暂停游戏" }).click();
  await expect(page.getByRole("dialog")).toContainText("未能保存进度");
});

test("compact menu retains modes, details, settings and focus", async ({
  page,
}) => {
  await loadGame(page, fixture("journey", 1).save);
  await page.getByRole("button", { name: "本局详情与设置" }).click();
  await expect(page.getByRole("dialog")).toContainText("本局最佳连消");
  await expect(page.getByRole("dialog")).toContainText("辅助状态");
  await page.getByRole("button", { name: "音效与设置", exact: true }).click();
  await expect(page.getByRole("slider", { name: "音效音量" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "本局详情与设置" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "切换游戏模式" }).click();
  await page.getByRole("button", { name: "限时鲜榨", exact: true }).click();
  await page.getByRole("button", { name: /进阶 9 种水果/ }).click();
  await checkLayout(page, true);
  await page.getByRole("button", { name: "切换游戏模式" }).click();
  await page.getByRole("button", { name: "果园漫游", exact: true }).click();
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  await checkLayout(page, true);
});

test("malformed import explains recovery in Chinese and keeps the classic board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await loadGame(page, fixture("journey", 24).save);
  const before = await page.locator("#board").innerHTML();
  await page.getByRole("button", { name: "本局详情与设置" }).click();
  await page.getByRole("button", { name: "音效与设置", exact: true }).click();
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":'),
    });
  const error = page.getByRole("dialog", { name: "无法导入这份进度" });
  await expect(error).toContainText("存档不是完整的 JSON 文件");
  await expect(error).toContainText("当前进度已保留。请在原模式重新导出进度后再试。");
  await error.getByRole("button", { name: "返回设置" }).click();
  await expect(page.getByRole("button", { name: "导入进度" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  expect(await page.locator("#board").innerHTML()).toBe(before);
  await checkLayout(page, true);
});

test("real elimination and clear-to-next-board keep HUD and controls visible", async ({
  page,
}) => {
  const { save, game, config } = fixture("sprint");
  while (remaining(game.board) > 1) {
    commitMatch(game, findPairs(game.board, 1)[0], config);
  }
  const pair = findPairs(game.board, 1)[0];
  await loadGame(page, save);
  const oldScore = game.score;
  await page.locator(`[data-cell="${pair.a.r},${pair.a.c}"]`).click();
  await page.locator(`[data-cell="${pair.b.r},${pair.b.c}"]`).click();
  await page.clock.runFor(500);
  await expect(page.locator("#secondary-stat")).not.toHaveText(
    oldScore.toLocaleString("zh-CN"),
  );
  expect(await page.locator(".fruit-tile").count()).toBeGreaterThan(2);
  await checkLayout(page, true);
});

test("outer connection remains aligned and stays in its board gutter", async ({
  page,
}) => {
  await loadGame(page, fixture("sprint").save);
  await page.getByRole("button", { name: "提示", exact: true }).click();
  const error = await page.evaluate(() => {
    const shell = document
      .querySelector(".board-shell")!
      .getBoundingClientRect();
    const line = document.querySelector<SVGPolylineElement>(
      "#connections polyline",
    )!;
    const points = [...line.points];
    const tiles = [...document.querySelectorAll(".hinted")].map((e) =>
      e.getBoundingClientRect(),
    );
    if (
      points.some(
        (p) => p.x < 0 || p.y < 0 || p.x > shell.width || p.y > shell.height,
      )
    )
      return "outside gutter";
    for (const p of [points[0], points[points.length - 1]]) {
      if (
        !tiles.some(
          (r) =>
            Math.abs(p.x + shell.left - r.left - r.width / 2) < 0.1 &&
            Math.abs(p.y + shell.top - r.top - r.height / 2) < 0.1,
        )
      )
        return "misaligned endpoint";
    }
    return null;
  });
  expect(error).toBeNull();
  await checkLayout(page, true);
});

test("downloaded standalone HTML works offline with the same compact layout", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 480, height: 958 });
  await page.goto("/");
  await page.getByRole("button", { name: "本局详情与设置" }).click();
  await page.getByRole("button", { name: "音效与设置", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载离线版" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("果冻果园.html");
  const localFile = info.outputPath(download.suggestedFilename());
  await download.saveAs(localFile);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await context.setOffline(true);
  await loadGame(
    page,
    fixture("sprint", 17, 2, 10).save,
    pathToFileURL(localFile).href,
  );
  await checkLayout(page, true);
  await page.getByRole("button", { name: "提示", exact: true }).click();
  const hinted = await page
    .locator(".hinted")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-cell")));
  for (const cell of hinted)
    await page.locator(`[data-cell="${cell}"]`).click();
  await settle(page);
  await checkLayout(page, true);
  expect(requests).toEqual([]);
});

test.describe("desktop", () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: { width: 1440, height: 1000 },
  });
  test("decorative layout remains usable after compact-to-desktop resize", async ({
    page,
  }) => {
    await loadGame(page, fixture("sprint").save);
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator(".hero")).toBeVisible();
    await expect(page.locator(".compact-mode")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 700 });
    await checkLayout(page, true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settle(page);
    await expect(page.locator(".hero")).toBeVisible();
    const bounds = await page.locator(".tools").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
  });
});
