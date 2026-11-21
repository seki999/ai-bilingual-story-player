import { expect, it } from "vitest";
import { assignVoices } from "../src/providers/tts";
import type { Speaker } from "../src/types";

const speakers: Speaker[] = [
  { id: "speaker-1", name: "Speaker 1", language: "en", characterId: "a" },
  { id: "speaker-2", name: "Speaker 2", language: "en", characterId: "b" },
  { id: "speaker-3", name: "Speaker 3", language: "zh", characterId: "a" },
  { id: "speaker-4", name: "Speaker 4", language: "zh", characterId: "b" },
];
const voice = (name: string, lang: string): SpeechSynthesisVoice => ({
  name,
  lang,
  voiceURI: name,
  localService: true,
  default: false,
});
const voices = [
  voice("Microsoft Zira", "en-US"),
  voice("Microsoft David", "en-US"),
  voice("Microsoft Xiaoxiao Online", "zh-CN"),
  voice("Microsoft Yunyang Online", "zh-CN"),
];

it("chooses the requested voice within each speaker's language", () => {
  const assignments = assignVoices(speakers, {}, voices, {
    "speaker-1": "male",
    "speaker-2": "female",
    "speaker-3": "male",
    "speaker-4": "female",
  });
  expect([...assignments.values()].map((v) => v?.name)).toEqual([
    "Microsoft David",
    "Microsoft Zira",
    "Microsoft Yunyang Online",
    "Microsoft Xiaoxiao Online",
  ]);
});

it("respects an explicit voice and falls back within the same language", () => {
  const choices = assignVoices(
    speakers,
    { "speaker-1": "Microsoft Zira" },
    [voices[0], voices[2]],
    {
      "speaker-1": "male",
      "speaker-3": "male",
    },
  );
  expect(choices.get("speaker-1")).toBe(voices[0]);
  expect(choices.get("speaker-3")).toBe(voices[2]);
});
