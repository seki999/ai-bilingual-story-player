import type {
  PlaybackEntry,
  PlaybackTimeline,
  PlayerSettings,
  StoryProject,
  SubtitleCue,
} from "../types";

export function makeTimeline(project: StoryProject): PlaybackTimeline {
  const settings = project.player;
  const zh = project.cues.filter((c) => c.language === "zh");
  const en = project.cues.filter((c) => c.language === "en");
  const byId = new Map(project.cues.map((c) => [c.subtitleId, c]));
  const entries: PlaybackEntry[] = [];
  let duration = 0;
  const add = (cue: SubtitleCue, gap = 0) => {
    const length = Math.max(0.15, cue.endTime - cue.startTime) / settings.rate;
    entries.push({ cue, start: duration, end: duration + length, gap });
    duration += length + gap;
  };
  if (settings.mode !== "mixed")
    (settings.mode === "zh" ? zh : en).forEach((cue) => add(cue));
  else if (settings.order === "serial" && !settings.follow)
    [...zh, ...en].forEach((cue) => add(cue));
  else
    for (const group of project.groups) {
      for (const [language, list] of [
        ["zh", group.zh],
        ["en", group.en],
      ] as const) {
        const repeats = settings.follow
          ? language === "zh"
            ? settings.zhRepeats
            : settings.enRepeats
          : 1;
        for (let repeat = 0; repeat < repeats; repeat++)
          list.forEach((key, index) => {
            const cue = byId.get(key);
            if (cue)
              add(
                cue,
                settings.follow &&
                  language === "en" &&
                  index === list.length - 1 &&
                  repeat < repeats - 1
                  ? settings.gap
                  : 0,
              );
          });
      }
    }
  return { entries, duration };
}

export type PlaybackStatus =
  | "idle"
  | "preparing"
  | "playing"
  | "paused"
  | "seeking"
  | "completed"
  | "error";
export type Snapshot = {
  status: PlaybackStatus;
  index: number;
  elapsed: number;
  boundary?: number;
  error?: string;
};
export type PlayHandle = { pause(): void; resume(): void; stop(): void };
export type MediaEvents = {
  start(): void;
  time(seconds: number, boundary?: number): void;
  end(): void;
  error(message: string): void;
};
export interface TtsProvider {
  play(
    cue: SubtitleCue,
    settings: PlayerSettings,
    events: MediaEvents,
    elapsed?: number,
  ): Promise<PlayHandle>;
}

export class PlaybackEngine {
  snapshot: Snapshot = { status: "idle", index: 0, elapsed: 0 };
  private version = 0;
  private handle?: PlayHandle;
  private timer?: ReturnType<typeof setTimeout>;
  private gapRemaining = 0;
  private gapStart = 0;
  constructor(
    public timeline: PlaybackTimeline,
    public settings: PlayerSettings,
    private media: TtsProvider,
    private notify: (value: Snapshot) => void,
  ) {}
  private set(change: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.notify(this.snapshot);
  }
  private cancel() {
    this.version++;
    this.handle?.stop();
    this.handle = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.gapRemaining = 0;
  }
  dispose() {
    this.cancel();
  }
  stop() {
    this.cancel();
    this.set({
      status: "idle",
      elapsed: 0,
      boundary: undefined,
      error: undefined,
    });
  }
  play() {
    if (this.snapshot.status === "paused" && this.gapRemaining > 0) {
      this.set({ status: "playing" });
      this.startGap();
    } else if (this.snapshot.status === "paused" && this.handle) {
      this.set({ status: "playing" });
      this.handle.resume();
    } else {
      let target =
        this.snapshot.status === "completed" ? 0 : this.snapshot.index;
      if (
        this.settings.loop === "ab" &&
        (target < this.abStart() ||
          target >= Math.max(this.settings.a, this.settings.b))
      )
        target = this.abStart();
      void this.start(
        target,
        this.snapshot.status === "paused" && target === this.snapshot.index
          ? this.snapshot.elapsed
          : 0,
      );
    }
  }
  pause() {
    if (this.snapshot.status === "preparing") {
      this.cancel();
    } else if (this.snapshot.status === "playing") {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.gapRemaining = Math.max(
          1,
          this.gapRemaining - (performance.now() - this.gapStart),
        );
      }
      this.handle?.pause();
    } else return;
    this.set({ status: "paused" });
  }
  seekTime(time: number) {
    const index = Math.max(
      0,
      this.timeline.entries.findLastIndex((entry) => entry.start <= time),
    );
    const entry = this.timeline.entries[index];
    const offset = entry?.cue.audioAssetId
      ? Math.max(
          0,
          Math.min(entry.end - entry.start - 0.05, time - entry.start),
        )
      : 0;
    this.seek(index, undefined, offset);
  }
  seek(
    index: number,
    autoplay = ["playing", "preparing"].includes(this.snapshot.status),
    elapsed = 0,
  ) {
    if (!this.timeline.entries.length) return;
    this.cancel();
    const target = Math.max(
      0,
      Math.min(index, this.timeline.entries.length - 1),
    );
    this.set({
      status: "seeking",
      index: target,
      elapsed,
      boundary: undefined,
      error: undefined,
    });
    if (autoplay) void this.start(target, elapsed);
    else this.set({ status: "paused" });
  }
  stepScene(direction: -1 | 1) {
    const { index } = this.snapshot;
    const list = this.timeline.entries;
    const scene = list[index]?.cue.sceneId;
    let next = index + direction;
    while (list[next]?.cue.sceneId === scene && scene) next += direction;
    if (!list[next]) return;
    if (direction < 0)
      while (list[next - 1]?.cue.sceneId === list[next].cue.sceneId) next--;
    this.seek(next);
  }
  private startGap() {
    this.gapStart = performance.now();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.gapRemaining = 0;
      this.advance();
    }, this.gapRemaining);
  }
  private abStart() {
    return Math.max(
      0,
      Math.min(this.settings.a, this.settings.b, this.timeline.entries.length) -
        1,
    );
  }
  private advance() {
    const index = this.snapshot.index;
    const entries = this.timeline.entries;
    const loop = this.settings.loop;
    let next = index + 1;
    if (loop === "cue") next = index;
    if (
      loop === "ab" &&
      (next < this.abStart() ||
        next >= Math.max(this.settings.a, this.settings.b))
    )
      next = this.abStart();
    if (
      loop === "scene" &&
      entries[next]?.cue.sceneId !== entries[index].cue.sceneId
    ) {
      next = index;
      while (entries[next - 1]?.cue.sceneId === entries[index].cue.sceneId)
        next--;
    }
    if (next >= entries.length && loop === "story") next = 0;
    if (entries[next]) void this.start(next);
    else this.set({ status: "completed" });
  }
  private async start(index: number, initialElapsed = 0) {
    const entry = this.timeline.entries[index];
    if (!entry) return;
    this.cancel();
    const version = this.version;
    const active = () => version === this.version;
    this.set({
      status: "preparing",
      index,
      elapsed: initialElapsed,
      boundary: undefined,
      error: undefined,
    });
    const fail = (message: string) => {
      if (!active()) return;
      this.cancel();
      this.set({ status: "error", error: message });
    };
    try {
      const handle = await this.media.play(
        entry.cue,
        this.settings,
        {
          start: () => {
            if (active()) this.set({ status: "playing" });
          },
          time: (elapsed, boundary) => {
            if (active() && this.snapshot.status === "playing")
              this.set({ elapsed, boundary });
          },
          end: () => {
            if (!active()) return;
            this.handle = undefined;
            if (entry.gap > 0 && this.settings.loop !== "cue") {
              this.gapRemaining = entry.gap * 1000;
              this.startGap();
            } else this.advance();
          },
          error: fail,
        },
        initialElapsed,
      );
      if (active()) this.handle = handle;
      else handle.stop();
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}
