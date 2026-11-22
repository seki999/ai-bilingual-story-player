import { test, expect } from "@playwright/test";

function tone(seconds: number) {
  const rate = 8000;
  const count = rate * seconds;
  const wave = Buffer.alloc(44 + count * 2);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(rate, 24);
  wave.writeUInt32LE(rate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    wave.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * 512),
      44 + i * 2,
    );
  return wave;
}

test("actual browser audio pauses with its subtitle and advances only when ended", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建故事" }).click();
  await page.getByLabel("故事名称").fill("音频测试");
  await page.getByLabel("双语对话").fill("Speaker 3: Hello! Goodbye!");
  await page.getByRole("button", { name: "生成分镜" }).click();
  await expect(page.getByRole("heading", { name: "音频测试" })).toBeVisible();
  await page.getByRole("button", { name: "故事编辑器" }).click();
  await page.getByRole("button", { name: "字幕与对齐" }).click();
  const sound = { name: "tone.wav", mimeType: "audio/wav", buffer: tone(2) };
  const groups = page.locator(".alignment");
  await groups.nth(0).getByLabel("上传字幕音频").setInputFiles(sound);
  await expect(groups.nth(0).locator("audio")).toHaveAttribute("src", /^blob:/);
  await groups.nth(1).locator("summary").click();
  await groups.nth(1).getByLabel("上传字幕音频").setInputFiles(sound);
  await expect(groups.nth(1).locator("audio")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "预览故事" }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  const progress = page.getByLabel("播放进度");
  await expect
    .poll(async () => Number(await progress.inputValue()))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await progress.inputValue();
  await page.waitForTimeout(2200);
  await expect(progress).toHaveValue(paused);
  await expect(page.locator(".subtitle")).toHaveText("Hello!");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".subtitle")).toHaveText("Goodbye!");
  await expect(page.locator(".subtitle")).toHaveText("Hello!");
  await expect(page.getByLabel("播放进度")).toHaveValue("0");
});
