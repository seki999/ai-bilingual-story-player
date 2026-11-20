import { id } from "../core/dialogue";
import { db } from "../storage/db";
import type { GenerationTask, ProviderConfig, Scene } from "../types";
import {
  generateImage,
  imageRequest,
  missingReferences,
  ProxyImageProvider,
  referenceRequest,
} from "./images";

export class ImageQueue {
  private controller?: AbortController;
  get active() {
    return Boolean(this.controller);
  }
  cancel() {
    this.controller?.abort();
  }
  async run(
    projectId: string,
    scenes: Scene[],
    config: ProviderConfig,
    onChange: () => void,
    force = false,
  ) {
    if (this.controller || !scenes.length) return;
    const controller = new AbortController();
    this.controller = controller;
    onChange();
    const { signal } = controller;
    const provider = new ProxyImageProvider(config);
    try {
      const existing = await db.tasks
        .where("projectId")
        .equals(projectId)
        .toArray();
      const tasks = scenes.map((scene) => {
        const old = existing.find((task) => task.sceneId === scene.sceneId);
        return {
          id: old?.id ?? id(),
          projectId,
          sceneId: scene.sceneId,
          status: "pending",
        } satisfies GenerationTask;
      });
      await db.tasks.bulkPut(tasks);
      onChange();
      const referenceErrors: string[] = [];
      const project =
        provider.supportsReferences && !force
          ? await db.projects.get(projectId)
          : undefined;
      if (project) {
        for (const person of missingReferences(project.characters, scenes)) {
          if (signal.aborted) break;
          try {
            const asset = await generateImage(
              provider,
              referenceRequest(person, project.generation.style),
              config.webpQuality,
              signal,
            );
            signal.throwIfAborted();
            await db.transaction("rw", db.projects, async () => {
              const fresh = await db.projects.get(projectId);
              const current = fresh?.characters.find(
                (character) => character.id === person.id,
              );
              if (
                !fresh ||
                !current ||
                current.referenceAssetId ||
                current.name !== person.name ||
                current.description !== person.description
              )
                return;
              current.referenceAssetId = asset.id;
              await db.projects.put(fresh);
            });
          } catch (cause) {
            if (!signal.aborted)
              referenceErrors.push(
                `${person.name}（${cause instanceof Error ? cause.message : String(cause)}）`,
              );
          }
        }
      }
      let cursor = 0;
      const worker = async () => {
        while (!signal.aborted && cursor < tasks.length) {
          const index = cursor++;
          const task = tasks[index];
          let status: GenerationTask["status"] = "running";
          let error: string | undefined;
          await db.tasks.update(task.id, { status });
          onChange();
          try {
            const project = await db.projects.get(projectId);
            if (!project) throw new Error("故事已删除。");
            const initial = scenes[index];
            const request = await imageRequest(initial, project.characters);
            const asset = await generateImage(
              provider,
              request,
              config.webpQuality,
              signal,
              force,
            );
            signal.throwIfAborted();
            await db.transaction("rw", db.projects, async () => {
              const latest = await db.projects.get(projectId);
              const current = latest?.scenes.find(
                (scene) => scene.sceneId === initial.sceneId,
              );
              if (
                !latest ||
                !current ||
                current.imagePrompt !== initial.imagePrompt ||
                current.negativePrompt !== initial.negativePrompt ||
                current.assetId !== initial.assetId ||
                current.generationVersion !== initial.generationVersion
              ) {
                throw new Error("镜头在生成期间已修改，请按需重新生成。");
              }
              Object.assign(current, {
                assetId: asset.id,
                imageStatus: "ready",
                generationProvider: provider.version,
                generationVersion: current.generationVersion + 1,
                imageVersions: [
                  ...new Set([...current.imageVersions, asset.id]),
                ],
              });
              await db.projects.put(latest);
            });
            status = "done";
          } catch (cause) {
            status = signal.aborted ? "cancelled" : "failed";
            error = cause instanceof Error ? cause.message : String(cause);
          }
          await db.tasks.update(task.id, { status, error });
          onChange();
        }
      };
      const count = Math.max(
        1,
        Math.min(6, Math.trunc(config.concurrency) || 1, tasks.length),
      );
      const workers = await Promise.allSettled(
        Array.from({ length: count }, worker),
      );
      if (signal.aborted)
        await db.tasks.bulkUpdate(
          tasks.slice(cursor).map((task) => ({
            key: task.id,
            changes: { status: "cancelled" },
          })),
        );
      const failed = workers.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return referenceErrors;
    } finally {
      this.controller = undefined;
      onChange();
    }
  }
}
