import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSession, playMove } from "../../../src/journey/session";
import {
  emptyJourneySave,
  KEY,
  MAX_JOURNEY_SAVE_FILE_BYTES,
  parseJourneySave,
  serializeJourneySave,
} from "../../../src/journey/storage";
import { load, puzzle, state } from "./fixtures";

test("invalid import never changes current game; export can round-trip", async ({
  page,
}) => {
  await load(page, { theme: 14 });
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
    buffer: Buffer.from('{"version":'),
  });
  const error = page.getByRole("dialog", { name: "无法导入这份进度" });
  await expect(error).toContainText("存档不是完整的 JSON 文件");
  expect(await state(page)).toEqual(before);
  await error.getByRole("button", { name: "返回设置" }).click();
  await page.locator("#trial-import").setInputFiles(path!);
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  expect(await state(page)).toEqual(before);
});

test("closing settings discards a late import read", async ({ page }) => {
  await load(page);
  const before = await state(page);
  await page.evaluate(() => {
    File.prototype.text = () => new Promise(resolve => {
      Object.assign(window, { finishReadingSave: resolve });
    });
  });
  await page.getByRole("button", { name: "音效与设置" }).click();
  await page.locator("#trial-import").setInputFiles({
    name: "progress.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeJourneySave(before)),
  });
  await page.waitForFunction(() => "finishReadingSave" in window);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "玩法说明" }).click();
  await page.evaluate(async text => {
    const finish = (window as unknown as { finishReadingSave: (text: string) => void }).finishReadingSave;
    finish(text);
    await Promise.resolve();
  }, serializeJourneySave(before));
  await expect(page.getByRole("heading", { name: "流转送达玩法" })).toBeVisible();
  expect(await state(page)).toEqual(before);
});

test("trial settings preserve newer classic progress and an unreadable classic save", async ({ page }) => {
  await load(page, { motion: false });
  const key = "jelly-grove.save.v1";
  const current = await page.evaluate(key => {
    const classic = JSON.parse(localStorage.getItem(key)!);
    classic.best = 600;
    classic.settings.volume = 0.4;
    localStorage.setItem(key, JSON.stringify(classic));
    return classic;
  }, key);
  await page.getByRole("button", { name: "音效与设置" }).click();
  const motion = page.locator("#trial-motion");
  await motion.click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual({
    ...current,
    settings: { ...current.settings, motion: true },
  });
  await page.evaluate(key => localStorage.setItem(key, "{damaged"), key);
  await motion.click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe("{damaged");
  await expect(page.locator("#trial-settings-status")).toContainText("未能保存");
});

test("large Unicode progress imports, downloads and reimports without losing history or sticky hints", async ({
  page,
}, testInfo) => {
  await load(page);
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
});

test("export stays available after a storage failure and reports download errors without losing progress", async ({
  page,
}, testInfo) => {
  await load(page, { theme: 14 });
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
