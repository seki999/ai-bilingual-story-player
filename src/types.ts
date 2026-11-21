export type Language = "zh" | "en";
export type Mode = Language | "mixed";
export type Density = "compact" | "standard" | "rich" | "max";
export type Speaker = {
  id: string;
  name: string;
  language: Language;
  characterId: string;
};
export type DialogueTurn = { id: string; speakerId: string; text: string };
export type SemanticSegment = {
  id: string;
  turnId: string;
  speakerId: string;
  language: Language;
  text: string;
};
export type AlignmentGroup = {
  id: string;
  zh: string[];
  en: string[];
  confidence: number;
};
export type CharacterProfile = {
  id: string;
  name: string;
  description: string;
  referenceAssetId?: string;
};
export type SubtitleCue = {
  subtitleId: string;
  language: Language;
  speakerId: string;
  text: string;
  alignmentGroupId: string;
  sceneId: string;
  audioAssetId?: string;
  startTime: number;
  endTime: number;
  segmentOrder: number;
};
export type Scene = {
  sceneId: string;
  sceneOrder: number;
  descriptionZh: string;
  descriptionEn: string;
  imagePrompt: string;
  negativePrompt: string;
  characters: string[];
  location: string;
  cameraShot: string;
  cameraAngle: string;
  emotion: string;
  visualAction: string;
  relatedDialogueIds: string[];
  generatedImageUrl?: string;
  imageStatus: "empty" | "ready";
  estimatedDuration: number;
  generationProvider?: string;
  generationVersion: number;
  assetId?: string;
  imageVersions: string[];
  zoom: number;
  position: string;
};
export type ImageAsset = {
  id: string;
  blob: Blob;
  kind: "image";
  cacheKey?: string;
};
export type AudioAsset = {
  id: string;
  blob: Blob;
  kind: "audio";
  cacheKey?: string;
};
export type Asset = ImageAsset | AudioAsset;
export type GenerationSettings = {
  density: Density;
  targetSceneDurationSeconds: number;
  maxSceneCount: number;
  imageCountBudget: number;
  style: string;
};
export type VoiceGender = "male" | "female";
export type PlayerSettings = {
  mode: Mode;
  order: "paired" | "paired-en-first" | "serial";
  rate: number;
  volume: number;
  voices: Record<string, string>;
  loop: "none" | "cue" | "scene" | "story" | "ab";
  a: number;
  b: number;
  follow: boolean;
  zhRepeats: number;
  enRepeats: number;
  gap: number;
  subtitlePlacement: "overlay" | "overlay-top" | "overlay-middle" | "below";
  subtitleScale?: number;
  voiceGenders?: Record<string, VoiceGender | undefined>;
  zhFont: string;
  enFont: string;
};
export type StoryProject = {
  version: 1;
  id: string;
  title: string;
  source: string;
  speakers: Speaker[];
  turns: DialogueTurn[];
  segments: SemanticSegment[];
  groups: AlignmentGroup[];
  scenes: Scene[];
  cues: SubtitleCue[];
  characters: CharacterProfile[];
  generation: GenerationSettings;
  player: PlayerSettings;
  progress?: string;
  updatedAt: number;
};
export type PlaybackEntry = {
  cue: SubtitleCue;
  start: number;
  end: number;
  gap: number;
};
export type PlaybackTimeline = { entries: PlaybackEntry[]; duration: number };
export type GenerationTask = {
  id: string;
  projectId: string;
  sceneId: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  error?: string;
};
export type ProviderConfig = {
  endpoint: string;
  model: string;
  supportsReferences: boolean;
  concurrency: number;
  unitPrice: number;
  webpQuality: number;
};
