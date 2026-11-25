import { importStory } from "./archive";
import { db } from "./db";

export type PublishedStory = {
  slug: string;
  title: string;
  hash: string;
  scenes: number;
  folder?: string;
};

export const publishedSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const publishedHash = /^[0-9a-f]{64}$/;

export function isPublishedStory(value: unknown): value is PublishedStory {
  if (!value || typeof value !== "object") return false;
  const story = value as Partial<PublishedStory>;
  return (
    typeof story.slug === "string" &&
    publishedSlug.test(story.slug) &&
    typeof story.title === "string" &&
    story.title.trim().length > 0 &&
    typeof story.hash === "string" &&
    publishedHash.test(story.hash) &&
    typeof story.scenes === "number" &&
    Number.isInteger(story.scenes) &&
    story.scenes > 0 &&
    (story.folder === undefined ||
      (typeof story.folder === "string" && story.folder.trim().length > 0))
  );
}

export async function loadCatalog(): Promise<PublishedStory[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}stories/index.json`);
  if (!response.ok) throw new Error("无法加载已发布的故事。");
  const catalog = await response.json();
  if (
    catalog?.version !== 1 ||
    !Array.isArray(catalog.stories) ||
    !catalog.stories.every(isPublishedStory)
  ) {
    throw new Error("公开故事目录格式无效。");
  }
  return catalog.stories;
}

export async function openPublished(
  story: PublishedStory,
  progress?: (value: number) => void,
) {
  const key = `published-${story.slug}-${story.hash}`;
  const saved = await db.projects.get(key);
  if (saved) return saved;
  const response = await fetch(
    `${import.meta.env.BASE_URL}stories/${story.slug}-${story.hash}.zip`,
  );
  if (!response.ok) throw new Error("无法加载故事资源。请联网后重试。");
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== story.hash) throw new Error("故事资源校验失败。");
  return importStory(new Blob([bytes]), progress, key);
}
