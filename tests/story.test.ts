import { describe, expect, it } from "vitest";
import { alignSegments, parseDialogue, splitText } from "../src/core/dialogue";
import {
  createAlignedStory,
  createStory,
  generationDefaults,
} from "../src/core/storyboard";
import { makeTimeline } from "../src/core/playback";
import { validateAlignment } from "../src/providers/alignment";
import demo from "../src/demo.txt?raw";

describe("dialogue and scenes", () => {
  it("recognizes four voices as two people and handles multiline speaker blocks", () => {
    const parsed = parseDialogue(
      demo +
        "\n\nSpeaker 1：还在笑。\n第二行。\n\nSpeaker 5: 你好。\nSpeaker 7: Hello.",
    );
    expect(
      parsed.speakers.slice(0, 4).map((s) => [s.language, s.characterId]),
    ).toEqual([
      ["zh", "character-1"],
      ["zh", "character-2"],
      ["en", "character-1"],
      ["en", "character-2"],
    ]);
    expect(parsed.turns[4].text).toBe("还在笑。\n第二行。");
    expect(parsed.speakers[4].characterId).toBe(parsed.speakers[5].characterId);
    expect(() => parseDialogue("对话")).toThrow("第 1 行缺少 Speaker");
    expect(() => parseDialogue("Speaker 1:")).toThrow("发言为空");
  });

  it("preserves contextual vocabulary and can skip or group semantically unmatched lines", () => {
    expect(
      splitText("我喜欢 fresh chicken sashimi（新鲜鸡肉刺身）！", "zh").join(
        "",
      ),
    ).toContain("fresh chicken sashimi（新鲜鸡肉刺身）");
    const data = parseDialogue(
      "Speaker 1: 你好。这里有一只鹦鹉。服务员！我要报警！\nSpeaker 3: Look at the parakeet! Waiter, call the police!",
    );
    const groups = alignSegments(data.segments, data.speakers);
    const index = new Map(data.segments.map((s) => [s.id, s.text]));
    const parakeet = groups.find((g) =>
      g.en.some((key) => index.get(key)?.includes("parakeet")),
    );
    expect(parakeet?.zh.map((key) => index.get(key)).join(" ")).toContain(
      "鹦鹉",
    );
    expect(parakeet?.zh.map((key) => index.get(key)).join(" ")).not.toContain(
      "你好",
    );
    expect(
      groups.flatMap((group) => [...group.zh, ...group.en]).sort(),
    ).toEqual(data.segments.map((s) => s.id).sort());
  });

  it("generates rich, distinct shots with bilingual links and enforces budgets", () => {
    const project = createStory("Demo", demo);
    expect(project.scenes.length).toBeGreaterThanOrEqual(12);
    expect(project.scenes.length).toBeLessThanOrEqual(20);
    expect(new Set(project.scenes.map((s) => s.imagePrompt)).size).toBe(
      project.scenes.length,
    );
    expect(project.characters.some((c) => c.name === "鹦鹉")).toBe(true);
    expect(
      project.scenes.some((scene) => /police|报警/i.test(scene.imagePrompt)),
    ).toBe(true);
    for (const group of project.groups.filter(
      (g) => g.en.length && g.zh.length,
    )) {
      expect(
        new Set(
          project.cues
            .filter((c) => c.alignmentGroupId === group.id)
            .map((c) => c.sceneId),
        ).size,
      ).toBe(1);
    }
    expect(
      createStory("Demo", demo, { ...generationDefaults, imageCountBudget: 3 })
        .scenes,
    ).toHaveLength(3);
    const counts = (["compact", "standard", "rich", "max"] as const).map(
      (density) =>
        createStory("Demo", demo, { ...generationDefaults, density }).scenes
          .length,
    );
    expect(counts).toEqual(counts.slice().sort((a, b) => a - b));
  });

  it("plays language-only, paired, serial and follow-along timelines", () => {
    const p = createStory("Demo", demo);
    for (const language of ["zh", "en"] as const) {
      p.player.mode = language;
      expect(
        makeTimeline(p).entries.every((e) => e.cue.language === language),
      ).toBe(true);
    }
    p.player.mode = "mixed";
    const paired = makeTimeline(p).entries;
    expect(paired.length).toBe(p.cues.length);
    expect(paired.findIndex((e) => e.cue.language === "en")).toBeLessThan(
      p.cues.filter((c) => c.language === "zh").length,
    );
    p.player.order = "serial";
    const serial = makeTimeline(p).entries;
    expect(serial.findIndex((e) => e.cue.language === "en")).toBe(
      p.cues.filter((c) => c.language === "zh").length,
    );
    p.player.follow = true;
    const follow = makeTimeline(p).entries;
    expect(follow.length).toBe(
      p.cues.length + p.cues.filter((c) => c.language === "en").length,
    );
    expect(follow.some((e) => e.gap === 3)).toBe(true);
  });

  it("rejects incomplete remote alignment and falls back when that provider fails", async () => {
    const parsed = parseDialogue(demo);
    expect(() =>
      validateAlignment({ groups: [] }, parsed.segments, new Map()),
    ).toThrow("漏掉");
    const result = await createAlignedStory("Demo", demo, generationDefaults, {
      async align() {
        throw new Error("offline");
      },
    });
    expect(result.fallback).toBe("offline");
    expect(result.project.cues).toHaveLength(parsed.segments.length);
  });
});
