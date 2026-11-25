import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createStory, generationDefaults } from "../src/core/storyboard";
import { packStory } from "../src/storage/archive";
import {
  isPublishedStory,
  publishedSlug,
  type PublishedStory,
} from "../src/storage/catalog";
import type { ImageAsset } from "../src/types";

const [command, sourceFile, title, ...args] = process.argv.slice(2);
if (!sourceFile || !title || !["plan", "add"].includes(command))
  throw new Error(
    'Usage: plan dialogue.txt "Title" [--shots N] or add dialogue.txt "Title" story-slug images/ [--shots N] [--folder "Name"]',
  );
const [slug, imageDirectory, ...addOptions] = args;
const options = command === "plan" ? args : addOptions;
const flags = new Map<string, string>();
for (let index = 0; index < options.length; index += 2) {
  const [flag, value] = options.slice(index, index + 2);
  if (!(flag === "--shots" || (command === "add" && flag === "--folder")) || !value?.trim())
    throw new Error(`Invalid or missing value for ${flag}.`);
  flags.set(flag, value.trim());
}

const folderName = flags.get("--folder");
const shots = flags.has("--shots") ? Number(flags.get("--shots")) : undefined;
if (shots !== undefined && (!Number.isInteger(shots) || shots < 1 || shots > 100))
  throw new Error("--shots must be an integer from 1 to 100.");
const project = createStory(
  title,
  await readFile(sourceFile, "utf8"),
  shots === undefined
    ? generationDefaults
    : {
        ...generationDefaults,
        density: "max",
        maxSceneCount: shots,
        imageCountBudget: shots,
      },
);
const imageNames = project.scenes.map(
  (_, i) => `scene-${String(i + 1).padStart(2, "0")}.webp`,
);

if (command === "plan") {
  console.log(
    JSON.stringify(
      project.scenes.map((scene, i) => ({
        file: imageNames[i],
        zh: scene.descriptionZh,
        en: scene.descriptionEn,
        prompt: scene.imagePrompt,
      })),
      null,
      2,
    ),
  );
} else {
  if (!slug || !publishedSlug.test(slug) || !imageDirectory)
    throw new Error(
      "Provide a lowercase, hyphenated story slug and an image directory.",
    );
  const assets: ImageAsset[] = [];
  for (const [index, name] of imageNames.entries()) {
    const image = await readFile(resolve(imageDirectory, name));
    if (
      image.length > 35 * 1024 * 1024 ||
      image.toString("ascii", 0, 4) !== "RIFF" ||
      image.toString("ascii", 8, 12) !== "WEBP"
    )
      throw new Error(`Invalid or oversized WebP image: ${name}`);
    const assetId = `scene-${index + 1}`;
    assets.push({
      id: assetId,
      kind: "image",
      blob: new Blob([image], { type: "image/webp" }),
    });
    Object.assign(project.scenes[index], {
      assetId,
      imageStatus: "ready",
      imageVersions: [assetId],
      generationProvider: "Codex ImageGen",
    });
  }

  const folder = resolve("public/stories");
  await mkdir(folder, { recursive: true });
  const indexFile = resolve(folder, "index.json");
  const catalog: { version: number; stories: PublishedStory[] } = JSON.parse(
    await readFile(indexFile, "utf8"),
  );
  if (catalog.version !== 1 || !catalog.stories.every(isPublishedStory))
    throw new Error("Invalid published story catalog.");
  if (catalog.stories.some((story) => story.slug === slug))
    throw new Error(`Story already exists: ${slug}`);
  const bytes = Buffer.from(
    await (await packStory(project, assets)).arrayBuffer(),
  );
  if (bytes.length > 95 * 1024 * 1024)
    throw new Error("Story exceeds 95 MB. Compress the images and try again.");
  const hash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(resolve(folder, `${slug}-${hash}.zip`), bytes, {
    flag: "wx",
  });
  catalog.stories.unshift({
    slug,
    title: project.title,
    hash,
    scenes: project.scenes.length,
    folder: folderName,
  });
  await writeFile(indexFile + ".tmp", JSON.stringify(catalog, null, 2) + "\n");
  await rename(indexFile + ".tmp", indexFile);
  console.log(
    `Added "${project.title}" to public/stories (${project.scenes.length} illustrated scenes).`,
  );
}
