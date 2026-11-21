import type {
  CharacterProfile,
  GenerationSettings,
  PlayerSettings,
  Scene,
  SemanticSegment,
  StoryProject,
  SubtitleCue,
} from "../types";
import { alignSegments, id, parseDialogue } from "./dialogue";
import type { AlignmentProvider } from "../providers/alignment";

export const styles = [
  "3D Animated Movie",
  "Realistic Cinema",
  "Japanese Anime",
  "Comic Illustration",
  "Watercolor Storybook",
];
export const generationDefaults: GenerationSettings = {
  density: "rich",
  targetSceneDurationSeconds: 4,
  maxSceneCount: 40,
  imageCountBudget: 20,
  style: styles[0],
};
export const playerDefaults: PlayerSettings = {
  mode: "mixed",
  order: "paired",
  rate: 1,
  volume: 1,
  voices: {},
  loop: "none",
  a: 1,
  b: 2,
  follow: false,
  zhRepeats: 1,
  enRepeats: 2,
  gap: 3,
  subtitlePlacement: "overlay",
  subtitleScale: 100,
  voiceGenders: {},
  zhFont: "system-ui",
  enFont: "system-ui",
};

export function estimate(text: string, language: "zh" | "en") {
  const words = (text.match(/[\p{Letter}\d]+/gu) ?? []).length;
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  return Math.max(
    0.8,
    language === "zh"
      ? han / 4.6 + (text.match(/[a-z]+/gi) ?? []).length / 2.6
      : words / 2.55,
  );
}

const locations: [RegExp, string][] = [
  [/餐厅|餐馆|restaurant/i, "restaurant interior"],
  [/学校|school/i, "school"],
  [/公园|park/i, "park"],
  [/厨房|kitchen/i, "kitchen"],
  [/办公室|office/i, "office"],
  [/机场|airport/i, "airport"],
];
const shots: [RegExp, string, string, string][] = [
  [/带进|brought|entered/i, "中远景", "eye level", "arrival in motion"],
  [
    /拍摄|拍了|recorded/i,
    "手部特写",
    "over the shoulder",
    "show the act of recording",
  ],
  [
    /上传|posted|social media/i,
    "插入镜头",
    "over the shoulder",
    "show a phone being used",
  ],
  [
    /会说话|can talk|喊|scream|报警|police|顾客|customer/i,
    "面部特写",
    "low angle",
    "emphasize the comic reaction",
  ],
  [/笑|haha|joke/i, "双人中景", "eye level", "capture expressive reactions"],
];
const entities: [RegExp, string, string][] = [
  [
    /鹦鹉|parakeet|parrot/i,
    "鹦鹉",
    "Small bright green parakeet, coral beak, vivid teal tail",
  ],
  [
    /网红|influencer/i,
    "网红",
    "Young adult creator, dark bob, peach jacket, holding a black smartphone",
  ],
  [
    /服务员|waiter/i,
    "服务员",
    "Adult server with tied-back hair and a mustard apron",
  ],
  [/手机|phone/i, "手机", "Matte black smartphone with amber case"],
  [/狗|\bdog\b/i, "狗", "Small brown dog, floppy ears and a green collar"],
  [/猫|\bcat\b/i, "猫", "Orange tabby with a white chest and blue collar"],
];
const looks = [
  "Adult friend, short black hair, indigo jacket, round glasses",
  "Adult friend, wavy brown hair, moss green sweater",
  "Adult friend, curly hair, violet scarf",
];

export function blankScene(order: number): Scene {
  return {
    sceneId: id(),
    sceneOrder: order,
    descriptionZh: "",
    descriptionEn: "",
    imagePrompt: "",
    negativePrompt: "watermark, captions, text overlays, distorted anatomy",
    characters: [],
    location: "",
    cameraShot: "中景",
    cameraAngle: "eye level",
    emotion: "",
    visualAction: "",
    relatedDialogueIds: [],
    imageStatus: "empty",
    estimatedDuration: 4,
    generationVersion: 0,
    imageVersions: [],
    zoom: 1,
    position: "50% 50%",
  };
}

export function makePrompt(
  scene: Scene,
  characters: CharacterProfile[],
  style: string,
) {
  const cast = characters
    .filter((c) => scene.characters.includes(c.id))
    .map((c) => `${c.name}: ${c.description}`)
    .join("; ");
  return [
    style,
    "Wide 16:9 cinematic still, consistent recurring characters, keep bottom center clear for subtitles",
    scene.location,
    [scene.cameraShot, scene.cameraAngle].join(" / "),
    scene.emotion,
    scene.visualAction,
    scene.descriptionEn || scene.descriptionZh,
    cast,
  ]
    .filter(Boolean)
    .join(". ");
}

function scenePlan(
  data: ReturnType<typeof parseDialogue>,
  groups: StoryProject["groups"],
  settings: GenerationSettings,
  characters: CharacterProfile[],
) {
  const byId = new Map(data.segments.map((segment) => [segment.id, segment]));
  const bySpeaker = new Map(
    data.speakers.map((speaker) => [speaker.id, speaker]),
  );
  const beats = groups.map((group) => ({
    zh: group.zh.map((key) => byId.get(key)!),
    en: group.en.map((key) => byId.get(key)!),
  }));
  const time = beats.reduce(
    (n, beat) =>
      n +
      (beat.en.length ? beat.en : beat.zh).reduce(
        (sum, s) => sum + estimate(s.text, s.language),
        0,
      ),
    0,
  );
  const factor = { compact: 0.44, standard: 0.77, rich: 1, max: 1.5 }[
    settings.density
  ];
  const limit = Math.max(
    1,
    Math.min(settings.maxSceneCount, settings.imageCountBudget, 100),
  );
  const requested = Math.max(
    1,
    Math.min(
      limit,
      Math.round(
        (time / Math.max(1, settings.targetSceneDurationSeconds)) * factor,
      ),
    ),
  );
  // Rich plans retain independent dialogue beats when the shot budget allows it.
  const count = Math.min(
    limit,
    beats.length,
    settings.density === "max"
      ? beats.length
      : settings.density === "rich"
        ? Math.max(requested, Math.ceil(beats.length * 0.9))
        : requested,
  );
  const scenes: Scene[] = [];
  const groupScenes = new Map<string, string>();
  let location =
    locations.find(([pattern]) =>
      data.turns.some((turn) => pattern.test(turn.text)),
    )?.[1] ?? "";
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * beats.length) / count);
    const to = Math.floor(((i + 1) * beats.length) / count);
    const slice = beats.slice(from, to);
    const zh = slice
      .flatMap((beat) => beat.zh)
      .map((s) => s.text)
      .join(" ");
    const en = slice
      .flatMap((beat) => beat.en)
      .map((s) => s.text)
      .join(" ");
    const text = zh + " " + en;
    location =
      locations.find(([pattern]) => pattern.test(text))?.[1] ?? location;
    const shot = shots.find(([pattern]) => pattern.test(text));
    const segments = slice.flatMap((beat) => [...beat.zh, ...beat.en]);
    const people = segments.map((s) => bySpeaker.get(s.speakerId)!.characterId);
    const props = characters
      .filter((character) =>
        entities.some(
          ([pattern, name]) => name === character.name && pattern.test(text),
        ),
      )
      .map((c) => c.id);
    const scene: Scene = {
      ...blankScene(i),
      descriptionZh: zh,
      descriptionEn: en,
      location,
      cameraShot: shot?.[1] ?? (i === 0 ? "全景" : "中景"),
      cameraAngle: shot?.[2] ?? "eye level",
      emotion: /[!！]|ridiculous/i.test(text)
        ? "expressive surprise or comic urgency"
        : "natural conversational expression",
      visualAction: shot?.[3] ?? "depict the action implied by the dialogue",
      characters: [...new Set([...people, ...props])],
      relatedDialogueIds: [...new Set(segments.map((s) => s.turnId))],
      estimatedDuration: slice.reduce(
        (sum, beat) =>
          sum +
          (beat.en.length ? beat.en : beat.zh).reduce(
            (n, s) => n + estimate(s.text, s.language),
            0,
          ),
        0,
      ),
    };
    scene.imagePrompt = makePrompt(scene, characters, settings.style);
    scenes.push(scene);
    for (const group of groups.slice(from, to))
      groupScenes.set(group.id, scene.sceneId);
  }
  return { scenes, groupScenes };
}

function checkedDialogue(source: string) {
  if (source.length > 90000)
    throw new Error("对话超过 90,000 字符，请拆成多个故事。");
  const data = parseDialogue(source);
  if (data.segments.length > 1200)
    throw new Error("字幕超过 1,200 段，请拆成多个故事。");
  return data;
}

export function createStory(
  title: string,
  source: string,
  generation = generationDefaults,
): StoryProject {
  const data = checkedDialogue(source);
  return assembleStory(
    title,
    source,
    generation,
    data,
    alignSegments(data.segments, data.speakers),
  );
}

export async function createAlignedStory(
  title: string,
  source: string,
  generation: GenerationSettings,
  provider: AlignmentProvider,
) {
  const data = checkedDialogue(source);
  try {
    const groups = await provider.align(data.segments, data.speakers);
    return {
      project: assembleStory(title, source, generation, data, groups),
      fallback: "",
    };
  } catch (error) {
    const groups = alignSegments(data.segments, data.speakers);
    return {
      project: assembleStory(title, source, generation, data, groups),
      fallback: error instanceof Error ? error.message : String(error),
    };
  }
}

function assembleStory(
  title: string,
  source: string,
  generation: GenerationSettings,
  data: ReturnType<typeof parseDialogue>,
  groups: StoryProject["groups"],
): StoryProject {
  const people = [
    ...new Set(data.speakers.map((speaker) => speaker.characterId)),
  ];
  const characters: CharacterProfile[] = [
    ...people.map((key, index) => ({
      id: key,
      name: `人物 ${String.fromCharCode(65 + index)}`,
      description: looks[index % looks.length],
    })),
    ...entities
      .filter(([pattern]) => pattern.test(source))
      .map(([, name, description]) => ({ id: id(), name, description })),
  ];
  const { scenes, groupScenes } = scenePlan(
    data,
    groups,
    generation,
    characters,
  );
  const groupBySegment = new Map(
    groups.flatMap((group) =>
      [...group.zh, ...group.en].map((key) => [key, group.id]),
    ),
  );
  const clock = { zh: 0, en: 0 };
  const cues = data.segments.map(
    (segment: SemanticSegment, segmentOrder): SubtitleCue => {
      const alignmentGroupId = groupBySegment.get(segment.id)!;
      const startTime = clock[segment.language];
      const endTime = startTime + estimate(segment.text, segment.language);
      clock[segment.language] = endTime;
      return {
        subtitleId: segment.id,
        language: segment.language,
        speakerId: segment.speakerId,
        text: segment.text,
        alignmentGroupId,
        sceneId: groupScenes.get(alignmentGroupId)!,
        segmentOrder,
        startTime,
        endTime,
      };
    },
  );
  return {
    version: 1,
    id: id(),
    title: title.trim() || "未命名故事",
    source,
    ...data,
    groups,
    scenes,
    cues,
    characters,
    generation: { ...generation },
    player: { ...playerDefaults, voices: {} },
    updatedAt: Date.now(),
  };
}
