import { expect, it, vi } from "vitest";
import {
  makeTimeline,
  PlaybackEngine,
  type MediaEvents,
} from "../src/core/playback";
import { createStory } from "../src/core/storyboard";

it("pauses the driver and rejects events from cancelled cues", async () => {
  const p = createStory(
    "Test",
    "Speaker 1: 你好！再见！\nSpeaker 3: Hello! Goodbye!",
  );
  const events: MediaEvents[] = [];
  const handle = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  const engine = new PlaybackEngine(
    makeTimeline(p),
    p.player,
    {
      async play(_cue, _settings, callbacks) {
        events.push(callbacks);
        callbacks.start();
        return handle;
      },
    },
    () => {},
  );
  engine.play();
  await Promise.resolve();
  events[0].time(0.2, 1);
  engine.pause();
  expect(handle.pause).toHaveBeenCalledOnce();
  events[0].time(0.9, 3);
  expect(engine.snapshot).toMatchObject({
    status: "paused",
    elapsed: 0.2,
    index: 0,
    boundary: 1,
  });
  engine.play();
  expect(handle.resume).toHaveBeenCalledOnce();
  engine.seek(1);
  await Promise.resolve();
  events[0].end();
  expect(engine.snapshot).toMatchObject({ index: 1, status: "playing" });
  events[1].end();
  expect(engine.snapshot.index).toBe(2);
  await Promise.resolve();
  engine.jumpToEnd();
  events[2].end();
  expect(engine.snapshot).toMatchObject({
    index: engine.timeline.entries.length - 1,
    status: "completed",
  });
  engine.play();
  expect(engine.snapshot.index).toBe(0);
  await Promise.resolve();
  engine.dispose();
});

it("honors A–B boundaries and waits for end callbacks rather than estimates", async () => {
  const p = createStory("Test", "Speaker 3: Hello! Goodbye! See you! Thanks!");
  p.player.loop = "ab";
  p.player.a = 2;
  p.player.b = 3;
  let media!: MediaEvents;
  const engine = new PlaybackEngine(
    makeTimeline(p),
    p.player,
    {
      async play(_cue, _settings, callbacks) {
        media = callbacks;
        media.start();
        return { pause() {}, resume() {}, stop() {} };
      },
    },
    () => {},
  );
  engine.seek(1, true);
  await Promise.resolve();
  media.time(30);
  expect(engine.snapshot.index).toBe(1);
  media.end();
  expect(engine.snapshot.index).toBe(2);
  await Promise.resolve();
  media.end();
  expect(engine.snapshot.index).toBe(1);
  engine.dispose();
});
