import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+NCEAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const synth = new EventTarget();
    let current: SpeechSynthesisUtterance | undefined;
    let timer: number | undefined;
    let paused = false;
    const next = () => {
      if (!current || paused) return;
      timer = window.setTimeout(() => {
        const cue = current;
        current = undefined;
        cue?.onend?.(new Event("end") as SpeechSynthesisEvent);
      }, 1400);
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: Object.assign(synth, {
        getVoices: () => [],
        speak: (cue: SpeechSynthesisUtterance) => {
          current = cue;
          window.setTimeout(() => {
            if (current === cue) {
              cue.onstart?.(new Event("start") as SpeechSynthesisEvent);
              next();
            }
          }, 10);
        },
        pause: () => {
          paused = true;
          window.clearTimeout(timer);
        },
        resume: () => {
          if (paused) {
            paused = false;
            next();
          }
        },
        cancel: () => {
          current = undefined;
          paused = false;
          window.clearTimeout(timer);
        },
      }),
    });
  });
});

test("demo, planning, all modes, playback, editing, persistence and ZIP import", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "鹦鹉餐厅闹剧" }),
  ).toBeVisible();
  await expect(page.locator(".frame img")).toBeVisible();
  await page.getByRole("button", { name: "新建故事" }).click();
  await page.getByRole("button", { name: "填入鹦鹉餐厅示例" }).click();
  await page.getByLabel("故事名称").fill("Playwright 故事");
  await page.getByRole("button", { name: "生成分镜" }).click();
  await expect(
    page.getByRole("heading", { name: "Playwright 故事" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /已生成 1[2-9]|已生成 20/,
  );
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator(".cue-lang.en")).toHaveCount(0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator(".cue-lang.zh")).toHaveCount(0);
  await page.getByRole("button", { name: "中英对照", exact: true }).click();
  await page.getByLabel("中英播放顺序").selectOption("serial");
  await expect(page.locator(".cue-lang").first()).toHaveText("中");
  await expect(page.locator(".cue-lang").last()).toHaveText("EN");
  await page.getByLabel("中英播放顺序").selectOption("paired-en-first");
  await expect(page.locator(".cue-lang").first()).toHaveText("EN");
  await expect(page.locator(".speaker-label")).toContainText("EN");
  await page.getByLabel("中英播放顺序").selectOption("paired");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await page.locator(".subtitle").textContent();
  await page.waitForTimeout(1550);
  await expect(page.locator(".subtitle")).toHaveText(paused!);
  await page.getByRole("button", { name: "下一句" }).click();
  await expect(page.locator(".subtitle")).not.toHaveText(paused!);
  await page.getByRole("button", { name: "分镜", exact: true }).click();
  await page.locator(".scene-row").first().click();
  await expect(page.locator(".frame-label")).toContainText("01");
  await page.getByRole("button", { name: "故事编辑器" }).click();
  const images = page.getByLabel("上传场景图片");
  await images.setInputFiles({
    name: "scene-a.png",
    mimeType: "image/png",
    buffer: pixel,
  });
  await expect(page.getByRole("status")).toHaveText("资源已保存。");
  await page.locator(".scene-menu-row").nth(1).click();
  await expect(page.locator(".editor-preview img")).toHaveCount(0);
  await images.setInputFiles(resolve("public/demo/arrival.webp"));
  await expect(page.locator(".editor-preview img")).toBeVisible();
  await page.locator(".scene-menu-row").first().click();
  await images.setInputFiles(resolve("public/demo/protest.webp"));
  await expect(page.getByRole("status")).toHaveText("资源已保存。");
  await page.locator(".scene-menu-row").nth(1).click();
  await expect(page.locator(".editor-preview img")).toBeVisible();
  await page.getByRole("button", { name: "字幕与对齐" }).click();
  await page.locator(".alignment textarea").first().fill("已编辑的字幕。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("项目已保存");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Playwright 故事" }),
  ).toBeVisible();
  await expect(page.getByLabel("中英播放顺序")).toHaveValue("paired");
  await expect(page.locator(".cue", { hasText: "已编辑的字幕。" })).toHaveCount(
    1,
  );
  await expect(page.locator(".frame img")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const file = info.outputPath("story.zip");
  await (await download).saveAs(file);
  await page.getByRole("button", { name: "项目库" }).click();
  await page.getByLabel("导入故事 ZIP").setInputFiles(file);
  await expect(page.getByRole("status")).toHaveText("已导入故事。");
  await expect(page.locator(".cue", { hasText: "已编辑的字幕。" })).toHaveCount(
    1,
  );
  await expect(page.locator(".frame img")).toBeVisible();
});

test("mobile has room for the player and transcript", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".frame")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "对话", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
