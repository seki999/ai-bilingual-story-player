import JSZip from "jszip";
import type { Asset, StoryProject } from "../types";
import { id } from "../core/dialogue";
import { assetIds, db } from "./db";
import {
  generationDefaults,
  playerDefaults,
  withSubtitleDefaults,
} from "../core/storyboard";

const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const audioTypes = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aac",
  "audio/x-m4a",
]);
export const permitsAsset = (mime: string, kind: Asset["kind"]) =>
  (kind === "image" ? imageTypes : audioTypes).has(mime);

export async function exportStory(
  project: StoryProject,
  progress: (value: number) => void = () => {},
) {
  return packStory(
    project,
    await db.assets.bulkGet(assetIds(project)),
    progress,
  );
}

export async function packStory(
  project: StoryProject,
  blobs: (Asset | undefined)[],
  progress: (value: number) => void = () => {},
) {
  const zip = new JSZip();
  const keys = assetIds(project);
  const assets = await Promise.all(
    blobs.map(async (blob, index) => {
      if (!blob) throw new Error(`资源缺失：${keys[index]}`);
      const path = `${blob.kind === "image" ? "images" : "audio"}/${index}.bin`;
      zip.file(path, await blob.blob.arrayBuffer());
      return { id: blob.id, path, kind: blob.kind, mime: blob.blob.type };
    }),
  );
  const { scenes, cues, characters, ...metadata } = project;
  const portableScenes = scenes.map((scene) => ({
    ...scene,
    generatedImageUrl: undefined,
  }));
  zip.file("project.json", JSON.stringify(metadata, null, 2));
  zip.file("scenes.json", JSON.stringify(portableScenes, null, 2));
  zip.file("subtitles.json", JSON.stringify(cues, null, 2));
  zip.file("characters.json", JSON.stringify(characters, null, 2));
  zip.file(
    "manifest.json",
    JSON.stringify(
      { format: "ai-bilingual-story-player", version: 1, assets },
      null,
      2,
    ),
  );
  return zip.generateAsync(
    { type: "blob", mimeType: "application/zip" },
    (event) => progress(event.percent),
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rows(
  value: unknown,
  fields: string[],
  numbers: string[] = [],
  strings: string[] = [],
): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length <= 2500 &&
    value.every(
      (item) =>
        record(item) &&
        fields.every((key) => typeof item[key] === "string") &&
        numbers.every(
          (key) => typeof item[key] === "number" && Number.isFinite(item[key]),
        ) &&
        strings.every(
          (key) =>
            Array.isArray(item[key]) &&
            item[key].every((value) => typeof value === "string"),
        ),
    )
  );
}

function readSettings<T extends object>(defaults: T, input: unknown): T {
  const settings = { ...defaults };
  if (!record(input)) return settings;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = input[key];
    if (typeof value === typeof defaults[key] && value !== null)
      settings[key] = value as T[typeof key];
  }
  return settings;
}

function validate(
  project: Record<string, unknown>,
): asserts project is Record<string, unknown> & StoryProject {
  if (
    project.version !== 1 ||
    typeof project.title !== "string" ||
    typeof project.source !== "string" ||
    !rows(project.speakers, ["id", "language", "name", "characterId"]) ||
    !rows(project.turns, ["id", "speakerId", "text"]) ||
    !rows(project.segments, [
      "id",
      "turnId",
      "text",
      "speakerId",
      "language",
    ]) ||
    !rows(project.groups, ["id"], ["confidence"], ["zh", "en"]) ||
    !rows(project.characters, ["id", "name", "description"]) ||
    !rows(
      project.scenes,
      [
        "sceneId",
        "descriptionZh",
        "descriptionEn",
        "imagePrompt",
        "negativePrompt",
        "location",
        "cameraShot",
        "cameraAngle",
        "emotion",
        "visualAction",
        "position",
        "imageStatus",
      ],
      ["sceneOrder", "estimatedDuration", "generationVersion", "zoom"],
      ["characters", "relatedDialogueIds", "imageVersions"],
    ) ||
    !rows(
      project.cues,
      [
        "subtitleId",
        "text",
        "speakerId",
        "language",
        "alignmentGroupId",
        "sceneId",
      ],
      ["startTime", "endTime", "segmentOrder"],
    )
  )
    throw new Error("故事结构无效。");
  const sceneKeys = new Set(project.scenes.map((scene) => scene.sceneId));
  const speakerKeys = new Set(project.speakers.map((speaker) => speaker.id));
  const groupKeys = new Set(project.groups.map((group) => group.id));
  const cueKeys = new Set(project.cues.map((cue) => cue.subtitleId));
  const assigned = project.groups.flatMap((group) => [
    ...(group.zh as string[]),
    ...(group.en as string[]),
  ]);
  if (
    sceneKeys.size !== project.scenes.length ||
    speakerKeys.size !== project.speakers.length ||
    groupKeys.size !== project.groups.length ||
    cueKeys.size !== project.cues.length ||
    assigned.length !== cueKeys.size ||
    new Set(assigned).size !== cueKeys.size ||
    assigned.some((key) => !cueKeys.has(key)) ||
    project.cues.some(
      (cue) =>
        !sceneKeys.has(cue.sceneId) ||
        !speakerKeys.has(cue.speakerId) ||
        !groupKeys.has(cue.alignmentGroupId) ||
        (cue.language !== "zh" && cue.language !== "en") ||
        Number(cue.endTime) <= Number(cue.startTime),
    )
  ) {
    throw new Error("故事包含无效的字幕、场景或对齐关系。");
  }
}

export async function importStory(
  file: Blob,
  progress: (value: number) => void = () => {},
  projectId: string = id(),
) {
  if (file.size > 250 * 1024 * 1024) throw new Error("故事包超过 250 MB。");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (name: string): Promise<unknown> => {
    const entry = zip.file(name);
    if (!entry) throw new Error(`故事包缺少 ${name}。`);
    return JSON.parse(await entry.async("string"));
  };
  const manifest = await read("manifest.json");
  if (
    !record(manifest) ||
    manifest.format !== "ai-bilingual-story-player" ||
    manifest.version !== 1 ||
    !rows(manifest.assets, ["id", "kind", "mime", "path"])
  )
    throw new Error("不支持的故事包格式。");
  const metadata = await read("project.json");
  if (!record(metadata)) throw new Error("故事元数据无效。");
  const candidate = {
    ...metadata,
    scenes: await read("scenes.json"),
    cues: await read("subtitles.json"),
    characters: await read("characters.json"),
  };
  validate(candidate);
  const remap = new Map<string, string>();
  const assets: Asset[] = [];
  let bytes = 0;
  for (const item of manifest.assets) {
    const {
      path,
      mime,
      kind,
      id: old,
    } = item as { path: string; mime: string; kind: Asset["kind"]; id: string };
    const entry = zip.file(path);
    if (
      !entry ||
      (kind !== "image" && kind !== "audio") ||
      !permitsAsset(mime, kind) ||
      remap.has(old) ||
      !new RegExp(
        `^${kind === "image" ? "images" : "audio"}/[0-9]+[.]bin$`,
      ).test(path)
    )
      throw new Error("故事包含无效资源。");
    const decoded = await entry.async("arraybuffer");
    bytes += decoded.byteLength;
    if (bytes > 350 * 1024 * 1024) throw new Error("解压后的资源超过 350 MB。");
    const key = id();
    remap.set(old, key);
    assets.push({ id: key, blob: new Blob([decoded], { type: mime }), kind });
    progress((assets.length / manifest.assets.length) * 100);
  }
  const declared = new Map(
    manifest.assets.map((asset) => [asset.id, asset.kind]),
  );
  if (
    candidate.scenes.some((scene) =>
      [scene.assetId, ...scene.imageVersions].some(
        (key) => key && declared.get(key) !== "image",
      ),
    ) ||
    candidate.characters.some(
      (character) =>
        character.referenceAssetId &&
        declared.get(character.referenceAssetId) !== "image",
    ) ||
    candidate.cues.some(
      (cue) => cue.audioAssetId && declared.get(cue.audioAssetId) !== "audio",
    )
  )
    throw new Error("故事引用了缺失或类型不匹配的资源。");
  const settings = candidate.player;
  const p: StoryProject = {
    version: 1,
    id: projectId,
    title: candidate.title,
    source: candidate.source,
    speakers: candidate.speakers,
    turns: candidate.turns,
    segments: candidate.segments,
    groups: candidate.groups,
    progress:
      typeof candidate.progress === "string" ? candidate.progress : undefined,
    generation: readSettings(generationDefaults, candidate.generation),
    player: withSubtitleDefaults({
      ...readSettings(playerDefaults, settings),
      subtitleBilingual:
        record(settings) && typeof settings.subtitleBilingual === "boolean"
          ? settings.subtitleBilingual
          : undefined,
      subtitleScale:
        record(settings) && typeof settings.subtitleScale === "number"
          ? settings.subtitleScale
          : undefined,
    }),
    updatedAt: Date.now(),
    scenes: candidate.scenes.map((scene) => ({
      ...scene,
      generatedImageUrl: undefined,
      assetId: scene.assetId ? remap.get(scene.assetId) : undefined,
      imageVersions: scene.imageVersions.flatMap((key) => remap.get(key) ?? []),
    })),
    cues: candidate.cues.map((cue) => ({
      ...cue,
      audioAssetId: cue.audioAssetId ? remap.get(cue.audioAssetId) : undefined,
    })),
    characters: candidate.characters.map((c) => ({
      ...c,
      referenceAssetId: c.referenceAssetId
        ? remap.get(c.referenceAssetId)
        : undefined,
    })),
  };
  p.player.rate = Number.isFinite(p.player.rate)
    ? Math.max(0.6, Math.min(1.5, p.player.rate))
    : 1;
  p.player.volume = Number.isFinite(p.player.volume)
    ? Math.max(0, Math.min(1, p.player.volume))
    : 1;
  p.player.zhRepeats = Math.max(
    1,
    Math.min(8, Number(p.player.zhRepeats) || 1),
  );
  p.player.enRepeats = Math.max(
    1,
    Math.min(8, Number(p.player.enRepeats) || 1),
  );
  p.player.gap = Math.max(0, Math.min(60, Number(p.player.gap) || 0));
  const speakerKeys = new Set(p.speakers.map((s) => s.id));
  p.player.voices = record(p.player.voices)
    ? Object.fromEntries(
        Object.entries(p.player.voices).filter(
          ([key, value]) => speakerKeys.has(key) && typeof value === "string",
        ),
      )
    : {};
  if (!["zh", "en", "mixed"].includes(p.player.mode)) p.player.mode = "mixed";
  const saved = await db.transaction("rw", db.projects, db.assets, async () => {
    const existing = await db.projects.get(projectId);
    if (existing) return existing;
    await db.assets.bulkPut(assets);
    await db.projects.put(p);
    return p;
  });
  progress(100);
  return saved;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
