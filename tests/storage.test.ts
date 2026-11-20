import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { db, removeProject } from "../src/storage/db";
import { exportStory, importStory } from "../src/storage/archive";
import { createStory } from "../src/core/storyboard";

it("round-trips story data and actual image/audio assets without overwriting originals", async () => {
  const project = createStory(
    "测试",
    "Speaker 1: 你好！服务员！\nSpeaker 3: Hello! Waiter!",
  );
  project.player.order = "serial";
  project.scenes[0].assetId = "zip-image";
  project.scenes[0].imageVersions.push("zip-image");
  project.cues[0].audioAssetId = "zip-audio";
  project.progress = project.cues[1].subtitleId;
  await db.projects.put(project);
  await db.assets.bulkPut([
    {
      id: "zip-image",
      blob: new Blob(["png-bytes"], { type: "image/png" }),
      kind: "image",
    },
    {
      id: "zip-audio",
      blob: new Blob(["wav-bytes"], { type: "audio/wav" }),
      kind: "audio",
    },
  ]);
  const roundTrip = await importStory(await exportStory(project));
  expect(roundTrip.id).not.toBe(project.id);
  expect(roundTrip.source).toBe(project.source);
  expect(roundTrip.player.order).toBe("serial");
  expect(roundTrip.progress).toBe(project.progress);
  expect(roundTrip.scenes[0].assetId).not.toBe("zip-image");
  expect(
    await (await db.assets.get(roundTrip.scenes[0].assetId!))?.blob.text(),
  ).toBe("png-bytes");
  expect(
    await (await db.assets.get(roundTrip.cues[0].audioAssetId!))?.blob.text(),
  ).toBe("wav-bytes");
  await removeProject(roundTrip.id);
  expect(await db.assets.get("zip-image")).toBeDefined();
});
