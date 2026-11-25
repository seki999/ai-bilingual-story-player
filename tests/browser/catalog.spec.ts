import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createStory } from "../../src/core/storyboard";
import { packStory } from "../../src/storage/archive";

test("a published story opens with illustration and stays available locally", async ({
  page,
}) => {
  const project = createStory(
    "公开故事测试",
    "Speaker 1: 你好！\nSpeaker 3: Hello!",
  );
  delete project.player.subtitleBilingual;
  project.player.subtitlePlacement = "overlay";
  project.player.subtitleScale = 100;
  const image = await readFile("public/demo/parakeet.webp");
  Object.assign(project.scenes[0], {
    assetId: "cover",
    imageStatus: "ready",
    imageVersions: ["cover"],
  });
  const zip = await packStory(project, [
    {
      id: "cover",
      kind: "image",
      blob: new Blob([image], { type: "image/webp" }),
    },
  ]);
  const bytes = Buffer.from(await zip.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  await page.route("**/stories/index.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        stories: [
          { slug: "public-test", title: project.title, hash, scenes: 1 },
        ],
      },
    }),
  );
  let downloads = 0;
  await page.route(`**/stories/public-test-${hash}.zip`, (route) => {
    downloads++;
    return route.fulfill({ body: bytes, contentType: "application/zip" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "项目库" }).click();
  await page.getByRole("button", { name: /公开故事测试/ }).click();
  await expect(
    page.getByRole("heading", { name: project.title }),
  ).toBeVisible();
  await expect(page.locator(".frame img")).toBeVisible();
  await expect(page.locator(".subtitle")).toHaveAttribute(
    "data-position",
    "overlay-middle",
  );
  await expect(page.locator('.subtitle-line[lang="en"]')).toHaveText("Hello!");
  await expect(page.locator('.subtitle-line[lang="zh"]')).toHaveText("你好！");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: project.title }),
  ).toBeVisible();
  await expect(page.locator(".frame img")).toBeVisible();
  expect(downloads).toBe(1);
});

test("published folders group episodes and retain manual organization", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "项目库" }).click();
  const series = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: "Kubernetes 沉浸式双语播客" }),
  });
  const episode = page.getByRole("button", { name: /播客：第2集/ });
  await expect(series.locator("summary")).toContainText("3 个故事");
  await expect(episode).toBeHidden();
  await series.locator("summary").click();
  await expect(series.getByRole("button")).toHaveText([
    /第1集/, /第2集/, /第3集/,
  ]);

  const name = page.getByRole("textbox", { name: "已发布故事文件夹名称" });
  await name.fill("稍后学习");
  await name.press("Enter");
  const folder = page.locator("details").filter({ hasText: "稍后学习" }).filter({
    has: page.locator("summary").filter({ hasText: "稍后学习" }),
  });
  const move = page.getByRole("combobox", { name: /移动.*第2集/ });
  await move.selectOption("稍后学习");
  await expect(folder.locator("summary")).toContainText("1 个故事");
  await page.reload();
  await page.getByRole("button", { name: "项目库" }).click();
  await folder.locator("summary").click();
  await expect(folder.getByRole("button", { name: /第2集/ })).toBeVisible();
  await move.selectOption("");
  await expect(folder.locator("summary")).toContainText("0 个故事");
  await expect(episode).toBeVisible();
});
