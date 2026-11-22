import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Maximize,
  Pause,
  Play,
  Repeat2,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import type { Mode, Scene, StoryProject } from "../types";
import type { PlaybackEngine, Snapshot } from "../core/playback";
import { useAssetUrl } from "../storage/useAsset";
import { formatTime, IconButton, SceneArt } from "./common";

type Props = {
  project: StoryProject;
  engine: PlaybackEngine;
  snapshot: Snapshot;
  onMode(mode: Mode): void;
  onSettings(change: Partial<StoryProject["player"]>): void;
  onEdit(sceneId?: string): void;
};

export function Player({
  project,
  engine,
  snapshot,
  onMode,
  onSettings,
  onEdit,
}: Props) {
  const [rail, setRail] = useState<"dialogue" | "scenes">("dialogue");
  const frame = useRef<HTMLDivElement>(null);
  const activeLine = useRef<HTMLButtonElement>(null);
  const { entries, duration } = engine.timeline;
  const entry = entries[snapshot.index];
  const cue = entry?.cue;
  const scene =
    project.scenes.find((item) => item.sceneId === cue?.sceneId) ??
    project.scenes[0];
  const nextScene = project.scenes.find(
    (item) =>
      item.sceneId ===
      entries
        .slice(snapshot.index + 1)
        .find((item) => item.cue.sceneId !== scene?.sceneId)?.cue.sceneId,
  );
  const image = useAssetUrl(scene?.assetId);
  const nextImage = useAssetUrl(nextScene?.assetId);
  useEffect(() => {
    if (!nextImage) return;
    const preload = new Image();
    preload.src = nextImage;
  }, [nextImage]);
  const playing =
    snapshot.status === "playing" || snapshot.status === "preparing";
  const speaker = project.speakers.find((item) => item.id === cue?.speakerId);
  const exact = Boolean(cue?.audioAssetId);
  const elapsed =
    snapshot.status === "completed"
      ? duration
      : entry
        ? Math.min(entry.end, entry.start + snapshot.elapsed)
        : 0;
  const group = project.groups.find(
    (item) => item.id === cue?.alignmentGroupId,
  );
  const modeLabels: [Mode, string][] = [
    ["zh", "中文"],
    ["en", "English"],
    ["mixed", "中英对照"],
  ];
  useEffect(() => {
    const line = activeLine.current;
    const parent = line?.parentElement;
    if (!line || !parent) return;
    if (line.offsetTop < parent.scrollTop) parent.scrollTop = line.offsetTop;
    else if (
      line.offsetTop + line.offsetHeight >
      parent.scrollTop + parent.clientHeight
    ) {
      parent.scrollTop =
        line.offsetTop + line.offsetHeight - parent.clientHeight;
    }
  }, [snapshot.index, rail, project.player.mode]);

  const bilingual = project.player.subtitleBilingual ?? true;
  const languages = bilingual
    ? (["en", "zh"] as const)
    : cue
      ? [cue.language]
      : [];
  const subtitles = cue && (
    <div
      className="subtitle"
      data-position={project.player.subtitlePlacement}
      style={{
        fontSize: `calc(clamp(0.88rem, 1.9vw, 1.42rem) * ${Math.max(0.75, Math.min(2, (project.player.subtitleScale ?? 200) / 100))})`,
      }}
    >
      {languages.map((language) => {
        const active = language === cue.language;
        const text = active
          ? cue.text
          : group?.[language]
              .map(
                (key) =>
                  project.cues.find((item) => item.subtitleId === key)?.text,
              )
              .filter(Boolean)
              .join(" ");
        if (!text) return null;
        return (
          <span
            key={language}
            className="subtitle-line"
            lang={language}
            data-active={active}
            style={{
              fontFamily:
                language === "en"
                  ? project.player.enFont
                  : project.player.zhFont,
            }}
          >
            {active ? highlight(text, snapshot.boundary) : text}
          </span>
        );
      })}
    </div>
  );
  const fullscreen = () => {
    if (!frame.current) return;
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : frame.current.requestFullscreen();
    void request.catch(() => {});
  };
  return (
    <>
      <div className="mode-row" aria-label="播放模式">
        {modeLabels.map(([mode, label]) => (
          <button
            key={mode}
            aria-pressed={project.player.mode === mode}
            onClick={() => onMode(mode)}
          >
            {label}
          </button>
        ))}
        {project.player.mode === "mixed" && (
          <select
            aria-label="中英播放顺序"
            value={project.player.order}
            onChange={(event) =>
              onSettings({
                order: event.target.value as StoryProject["player"]["order"],
              })
            }
          >
            <option value="paired">逐段对照 · 先中后英</option>
            <option value="paired-en-first">逐段对照 · 先英后中</option>
            <option value="serial">整篇中文后英语</option>
          </select>
        )}
      </div>
      <div className="player-grid">
        <section>
          <div className="frame-shell" ref={frame}>
            <div className={`frame ${playing ? "is-playing" : ""}`}>
              <SceneArt scene={scene} url={image} />
              <div className="frame-shade" />
              <span className="frame-label">
                <Clapperboard size={14} /> 镜头{" "}
                {String((scene?.sceneOrder ?? 0) + 1).padStart(2, "0")} /{" "}
                {project.scenes.length}
              </span>
              {speaker && (
                <span className="speaker-label">
                  <AudioLines size={14} /> {speaker.name} ·{" "}
                  {speaker.language === "zh" ? "中文" : "EN"}
                </span>
              )}
              {project.player.subtitlePlacement !== "below" && subtitles}
            </div>
            {project.player.subtitlePlacement === "below" && (
              <div className="subtitle-below">{subtitles}</div>
            )}
            <div className="controls">
              <div className="progress-line">
                <input
                  aria-label="播放进度"
                  type="range"
                  min="0"
                  max={duration || 1}
                  step="0.05"
                  value={elapsed}
                  onChange={(event) =>
                    engine.seekTime(Number(event.target.value))
                  }
                />
                <span
                  title={
                    exact
                      ? "当前段使用音频时钟，整篇长度为时间轴估计"
                      : "系统朗读的全篇时长为估计值"
                  }
                >
                  {formatTime(elapsed)} / {formatTime(duration)}
                </span>
              </div>
              <div className="control-row">
                <IconButton
                  className="primary play"
                  label={playing ? "暂停" : "播放"}
                  disabled={!entries.length}
                  onClick={() => (playing ? engine.pause() : engine.play())}
                >
                  {playing ? (
                    <Pause size={20} fill="currentColor" />
                  ) : (
                    <Play size={20} fill="currentColor" />
                  )}
                </IconButton>
                <IconButton label="停止" onClick={() => engine.stop()}>
                  <Square size={16} />
                </IconButton>
                <IconButton
                  label="上一句"
                  onClick={() => engine.seek(snapshot.index - 1)}
                >
                  <ChevronLeft size={20} />
                </IconButton>
                <IconButton
                  label="下一句"
                  onClick={() => engine.seek(snapshot.index + 1)}
                >
                  <ChevronRight size={20} />
                </IconButton>
                <span className="rule" />
                <IconButton
                  label="上一个镜头"
                  onClick={() => engine.stepScene(-1)}
                >
                  <SkipBack size={16} />
                </IconButton>
                <IconButton
                  label="下一个镜头"
                  onClick={() => engine.stepScene(1)}
                >
                  <SkipForward size={16} />
                </IconButton>
                <span className="push" />
                <label className="volume">
                  <Volume2 size={16} />
                  <input
                    aria-label="音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={project.player.volume}
                    onChange={(e) =>
                      onSettings({ volume: Number(e.target.value) })
                    }
                  />
                </label>
                <select
                  aria-label="语速"
                  value={project.player.rate}
                  onChange={(e) => onSettings({ rate: Number(e.target.value) })}
                >
                  {[0.6, 0.75, 1, 1.15, 1.25, 1.5].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}×
                    </option>
                  ))}
                </select>
                <IconButton
                  label="循环整篇"
                  className={project.player.loop === "story" ? "selected" : ""}
                  onClick={() =>
                    onSettings({
                      loop: project.player.loop === "story" ? "none" : "story",
                    })
                  }
                >
                  <Repeat2 size={18} />
                </IconButton>
                <IconButton label="全屏" onClick={fullscreen}>
                  <Maximize size={17} />
                </IconButton>
              </div>
              {snapshot.error && <p role="alert">{snapshot.error}</p>}
            </div>
          </div>
        </section>
        <aside className="rail">
          <div className="rail-head">
            <div className="tabs">
              <button
                aria-pressed={rail === "dialogue"}
                onClick={() => setRail("dialogue")}
              >
                对话
              </button>
              <button
                aria-pressed={rail === "scenes"}
                onClick={() => setRail("scenes")}
              >
                分镜
              </button>
            </div>
            <span>
              {rail === "dialogue"
                ? `${entries.length} 段`
                : `${project.scenes.length} 个镜头`}
            </span>
          </div>
          {rail === "dialogue" ? (
            <div className="cue-list">
              {entries.map((item, index) => {
                const line = item.cue;
                return (
                  <button
                    ref={index === snapshot.index ? activeLine : undefined}
                    className="cue"
                    key={`${line.subtitleId}-${index}`}
                    aria-current={index === snapshot.index}
                    onClick={() => engine.seek(index)}
                  >
                    <span className={`cue-lang ${line.language}`}>
                      {line.language === "zh" ? "中" : "EN"}
                    </span>
                    <span>
                      <small>
                        {formatTime(item.start)} ·{" "}
                        {
                          project.speakers.find((s) => s.id === line.speakerId)
                            ?.name
                        }
                      </small>
                      {line.text}
                    </span>
                  </button>
                );
              })}
              {!entries.length && (
                <p className="empty">这个故事没有当前语言的字幕。</p>
              )}
            </div>
          ) : (
            <div className="cue-list">
              {project.scenes.map((item) => (
                <SceneRow
                  key={item.sceneId}
                  scene={item}
                  active={item.sceneId === scene?.sceneId}
                  onClick={() => {
                    const index = entries.findIndex(
                      (entry) => entry.cue.sceneId === item.sceneId,
                    );
                    if (index < 0) onEdit(item.sceneId);
                    else engine.seek(index);
                  }}
                />
              ))}
            </div>
          )}
          <button className="rail-edit" onClick={() => onEdit(scene?.sceneId)}>
            在编辑器中打开当前镜头
          </button>
        </aside>
      </div>
    </>
  );
}

function SceneRow({
  scene,
  active,
  onClick,
}: {
  scene: Scene;
  active: boolean;
  onClick(): void;
}) {
  const row = useRef<HTMLButtonElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!row.current || !scene.assetId) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { root: row.current.parentElement, rootMargin: "180px" },
    );
    observer.observe(row.current);
    return () => observer.disconnect();
  }, [scene.assetId]);
  const url = useAssetUrl(nearViewport ? scene.assetId : undefined);
  return (
    <button
      ref={row}
      className="cue scene-row"
      aria-current={active}
      onClick={onClick}
    >
      <span className="thumbnail">
        <SceneArt scene={scene} url={url} small />
      </span>
      <span>
        <small>
          镜头 {scene.sceneOrder + 1} · {scene.cameraShot}
        </small>
        {scene.descriptionZh || scene.descriptionEn || "未命名镜头"}
      </span>
    </button>
  );
}

function highlight(text: string, index?: number) {
  if (index === undefined || index < 0 || index >= text.length) return text;
  const word = text
    .slice(index)
    .match(/^[\p{Script=Han}]|^[\p{Letter}\d'-]+/u)?.[0];
  if (!word) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{word}</mark>
      {text.slice(index + word.length)}
    </>
  );
}
