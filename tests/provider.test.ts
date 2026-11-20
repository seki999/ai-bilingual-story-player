import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { generateImage, ProxyImageProvider } from "../src/providers/images";
import { ImageQueue } from "../src/providers/queue";
import { createStory } from "../src/core/storyboard";
import { db } from "../src/storage/db";

const config = {
  endpoint: "https://story.test/image",
  model: "mock",
  supportsReferences: true,
  concurrency: 2,
  unitPrice: 0,
  webpQuality: 0,
};
afterEach(() => vi.unstubAllGlobals());

it("sends multipart references to the proxy and deduplicates concurrent/cached requests", async () => {
  const fetch = vi.fn(
    async () =>
      new Response("image", { headers: { "Content-Type": "image/webp" } }),
  );
  vi.stubGlobal("fetch", fetch);
  const provider = new ProxyImageProvider(config);
  const request = {
    prompt: "Two friends",
    negativePrompt: "watermark",
    references: [
      {
        id: "ref",
        kind: "image" as const,
        blob: new Blob(["ref"], { type: "image/png" }),
      },
    ],
  };
  const controller = new AbortController();
  const [a, b] = await Promise.all([
    generateImage(provider, request, 0, controller.signal),
    generateImage(provider, request, 0, controller.signal),
  ]);
  expect(a.id).toBe(b.id);
  expect(
    (await generateImage(provider, request, 0, controller.signal)).id,
  ).toBe(a.id);
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = (fetch.mock.calls as unknown as [URL, RequestInit][])[0][1]
    .body as FormData;
  expect(body.get("model")).toBe("mock");
  expect(body.getAll("reference")).toHaveLength(1);
});

it("keeps successful frames and retries failed tasks without replacing others", async () => {
  const p = createStory(
    "Queue",
    "Speaker 3: Hello! Goodbye! Call the police! I am a customer!",
  );
  const [first, second] = p.scenes;
  const failure = second.imagePrompt;
  const requests: FormData[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: URL, options: RequestInit) => {
      const request = options.body as FormData;
      requests.push(request);
      return new Response("image", {
        status: request.get("prompt") === failure ? 503 : 200,
        headers: { "Content-Type": "image/png" },
      });
    }),
  );
  await db.projects.put(p);
  const queue = new ImageQueue();
  await queue.run(p.id, [first, second], config, () => {});
  const saved = await db.projects.get(p.id);
  expect(requests[0].get("prompt")).toContain("Character design reference");
  expect(saved?.characters[0].referenceAssetId).toBeDefined();
  expect(
    requests
      .find((request) => request.get("prompt") === first.imagePrompt)
      ?.getAll("reference"),
  ).toHaveLength(1);
  expect(saved?.scenes[0].assetId).toBeDefined();
  expect(saved?.scenes[1].assetId).toBeUndefined();
  expect(await db.tasks.where("projectId").equals(p.id).toArray()).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: "failed" })]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("image", { headers: { "Content-Type": "image/png" } }),
    ),
  );
  await queue.run(p.id, [second], config, () => {});
  const retried = await db.projects.get(p.id);
  expect(retried?.scenes[0].assetId).toBe(saved?.scenes[0].assetId);
  expect(retried?.scenes[1].assetId).toBeDefined();
});
