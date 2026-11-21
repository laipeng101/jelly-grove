import { test, expect } from "@playwright/test";
import { findPairs } from "../../src/engine";
import { fixture } from "./classic/fixtures";

test.use({
  channel: "chromium",
  isMobile: false,
  hasTouch: false,
  reducedMotion: "no-preference",
  viewport: { width: 1440, height: 1000 },
  launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
});

test("both pages restore shared settings on actual history navigation and preserve progress", async ({ page }) => {
  const { save, game } = fixture("journey", 1);
  save.settings = { sound: true, motion: true, volume: 0.8 };
  await page.addInitScript((initial) => {
    const key = "jelly-grove.save.v1";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) document.documentElement.dataset.restored = "true";
    });
  }, save);
  await page.goto("/");
  await page.getByRole("button", { name: "继续这一局", exact: true }).click();
  await expect(page.locator("#play-caption")).toHaveText("点两颗相同水果，最多两弯，可绕外沿。");
  await page.getByRole("link", { name: "新关卡试玩", exact: true }).click();
  await expect(page.locator("#trial-board")).toBeVisible();
  await page.getByRole("button", { name: "音效与设置" }).click();
  const trialSettings = page.getByRole("dialog", { name: "音效与设置" });
  await expect(trialSettings.getByRole("link", { name: "下载离线版" })).toHaveAttribute("download", "");
  await trialSettings.getByRole("slider", { name: "音量", exact: true }).fill("37");
  await trialSettings.getByRole("switch", { name: "音效", exact: true }).click();
  await trialSettings.getByRole("switch", { name: "动效" }).click();

  await page.goBack({ waitUntil: "commit" });
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-restored", "true");
  await expect(root).toHaveClass(/reduce-motion/);
  const resume = page.getByRole("button", { name: "继续这一局", exact: true });
  if (await resume.isVisible()) await resume.click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const classicSettings = page.getByRole("dialog");
  const classicSound = classicSettings.getByRole("switch", { name: "果园音效" });
  const classicMotion = classicSettings.getByRole("switch", { name: "动效" });
  const classicVolume = classicSettings.getByRole("slider", { name: "音效音量" });
  await expect(classicSound).toHaveAttribute("aria-checked", "false");
  await expect(classicMotion).toHaveAttribute("aria-checked", "false");
  await expect(classicVolume).toHaveValue("37");
  await classicSound.click();
  await classicVolume.fill("53");

  await page.goForward({ waitUntil: "commit" });
  await expect(root).toHaveAttribute("data-restored", "true");
  await expect(trialSettings.getByRole("switch", { name: "音效", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(trialSettings.getByRole("slider", { name: "音量", exact: true })).toHaveValue("53");
  await page.goBack({ waitUntil: "commit" });
  await classicSettings.getByRole("button", { name: "关闭", exact: true }).click();
  const { a, b } = findPairs(game.board, 1)[0];
  for (const { r, c } of [a, b])
    await page.locator(`[data-cell="${r},${c}"]`).click();
  await expect(page.locator("#primary-stat")).toHaveText("100");
  await page.reload();
  await resume.click();
  await expect(page.locator("#primary-stat")).toHaveText("100");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(classicSound).toHaveAttribute("aria-checked", "true");
  await expect(classicMotion).toHaveAttribute("aria-checked", "false");
  await expect(classicVolume).toHaveValue("53");
});
