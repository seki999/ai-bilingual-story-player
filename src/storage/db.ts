import Dexie, { type Table } from "dexie";
import type { Asset, GenerationTask, StoryProject } from "../types";

export type FolderTutorial = {
  id: string;
  library: string;
  folder: string;
  name: string;
  html: string;
};

export class StoryDatabase extends Dexie {
  projects!: Table<StoryProject, string>;
  assets!: Table<Asset, string>;
  tasks!: Table<GenerationTask, string>;
  tutorials!: Table<FolderTutorial, string>;
  constructor(name = "ai-bilingual-story-player") {
    super(name);
    this.version(1).stores({
      projects: "id,updatedAt",
      assets: "id,cacheKey",
      tasks: "id,projectId,status",
    });
    this.version(2).stores({ tutorials: "id,[library+folder]" });
  }
}
export const db = new StoryDatabase();
export const selectionKey = "ai-bilingual-story-player:active:v1";

export function assetIds(project: StoryProject) {
  return [
    ...new Set(
      [
        ...project.scenes.flatMap((scene) => [
          scene.assetId,
          ...scene.imageVersions,
        ]),
        ...project.characters.map((character) => character.referenceAssetId),
        ...project.cues.map((cue) => cue.audioAssetId),
      ].filter((key): key is string => Boolean(key)),
    ),
  ];
}

export async function removeProject(key: string) {
  await db.transaction("rw", db.projects, db.assets, db.tasks, async () => {
    const removed = await db.projects.get(key);
    if (!removed) return;
    await db.projects.delete(key);
    await db.tasks.where("projectId").equals(key).delete();
    const referenced = new Set((await db.projects.toArray()).flatMap(assetIds));
    const candidates = assetIds(removed).filter(
      (assetId) => !referenced.has(assetId),
    );
    await db.assets.bulkDelete(candidates);
  });
}
