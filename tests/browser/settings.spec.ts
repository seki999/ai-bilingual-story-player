import { expect, test } from "@playwright/test";

test("subtitle scale and placement and per-speaker voice preferences persist", async ({
  page,
}) => {
  await page.goto("/");
  const subtitle = page.locator(".subtitle");
  await expect(subtitle).toBeVisible();
  await expect(subtitle).toHaveAttribute("data-position", "overlay-middle");
  await expect(subtitle.locator(".subtitle-line").first()).toHaveAttribute(
    "lang",
    "en",
  );
  await expect(subtitle.locator(".subtitle-line").last()).toHaveAttribute(
    "lang",
    "zh",
  );
  const originalSize = await subtitle.evaluate((el) =>
    parseFloat(getComputedStyle(el).fontSize),
  );
  const settings = page.getByRole("button", { name: "设置", exact: true });
  await expect(settings).toHaveText("设置");
  await settings.click();
  await expect(page.getByLabel("字幕大小")).toHaveValue("200");
  await expect(page.getByLabel("字幕位置")).toHaveValue("overlay-middle");
  await page.getByLabel("字幕大小").selectOption("150");
  await page.getByLabel("字幕位置").selectOption("overlay-top");
  for (const [speaker, gender] of [
    [1, "male"],
    [2, "female"],
    [3, "female"],
    [4, "male"],
  ]) {
    await page
      .getByLabel(`Speaker ${speaker} 声线`)
      .selectOption(gender.toString());
  }
  await page.getByRole("button", { name: "播放器", exact: true }).click();
  await expect(subtitle).toHaveAttribute("data-position", "overlay-top");
  expect(
    await subtitle.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeCloseTo(originalSize * 0.75, 1);
  await page.reload();
  await expect(subtitle).toHaveAttribute("data-position", "overlay-top");
  await settings.click();
  await expect(page.getByLabel("字幕大小")).toHaveValue("150");
  await expect(page.getByLabel("Speaker 1 声线")).toHaveValue("male");
  await expect(page.getByLabel("Speaker 2 声线")).toHaveValue("female");
  await expect(page.getByLabel("Speaker 3 声线")).toHaveValue("female");
  await expect(page.getByLabel("Speaker 4 声线")).toHaveValue("male");
});
