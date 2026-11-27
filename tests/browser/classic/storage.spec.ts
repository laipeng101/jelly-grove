import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fixture } from "./fixtures";

test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 900 } });

const saveKey = "jelly-grove.save.v1";

test("unreadable classic progress survives reload and a failed import until replaced", async ({ page }) => {
  const original = '{"version":99,"notes":"上一份进度"}';
  await page.addInitScript(({ key, original }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, original);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && document.documentElement.dataset.blockSave)
        throw new DOMException("Storage blocked by the test", "QuotaExceededError");
      setItem.call(this, name, value);
    };
  }, { key: saveKey, original });
  const saved = () => page.evaluate(key => localStorage.getItem(key), saveKey);

  await page.goto("/");
  const recovery = page.getByRole("dialog", { name: "无法加载原进度" });
  await expect(recovery).toBeVisible();
  expect(await saved()).toBe(original);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    recovery.getByRole("button", { name: "下载原进度" }).click(),
  ]);
  expect(await readFile((await download.path())!, "utf8")).toBe(original);

  await recovery.getByRole("button", { name: "继续玩" }).click();
  await page.reload();
  await expect(recovery).toBeVisible();
  expect(await saved()).toBe(original);

  await recovery.getByRole("button", { name: "继续玩" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.evaluate(() => { document.documentElement.dataset.blockSave = "true"; });
  await page.locator("#import-file").setInputFiles({
    name: "果冻果园.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture("sprint", 1).save)),
  });
  await page.getByRole("button", { name: "确认导入" }).click();
  expect(await saved()).toBe(original);
  await expect(page.locator("#toast")).toContainText("无法自动保存");

  await page.evaluate(() => { delete document.documentElement.dataset.blockSave; });
  await page.getByRole("button", { name: "继续这一局" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("switch", { name: "动效" }).click();
  expect(await saved()).toBe(original);
  await page.getByRole("button", { name: "处理原进度" }).click();
  await recovery.getByRole("button", { name: "用当前进度替换" }).click();
  expect(JSON.parse((await saved())!).version).toBe(1);
  await expect(page.locator("#save-label")).toHaveText("进度已自动保存");
});

test("a late import read respects the player's newer dialog", async ({ page }) => {
  const { save } = fixture("sprint", 1);
  const content = JSON.stringify(save);
  await page.addInitScript(content => {
    File.prototype.text = () => new Promise(resolve => {
      window.addEventListener("complete-import-read", () => resolve(content), { once: true });
      document.documentElement.dataset.importPending = "true";
    });
  }, content);

  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.locator("#import-file").setInputFiles({
    name: "果冻果园.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await expect(page.locator("html")).toHaveAttribute("data-import-pending", "true");
  await page.getByRole("dialog", { name: "设置" }).getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "玩法说明", exact: true }).first().click();
  await page.evaluate(() => window.dispatchEvent(new Event("complete-import-read")));

  await expect(page.getByRole("dialog", { name: "玩法说明" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "导入进度？" })).toHaveCount(0);
});
