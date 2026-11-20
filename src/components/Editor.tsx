import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  GripVertical,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  GenerationSettings,
  GenerationTask,
  ProviderConfig,
  Scene,
  StoryProject,
  SubtitleCue,
} from "../types";
import { blankScene, makePrompt, styles } from "../core/storyboard";
import { id } from "../core/dialogue";
import { useAssetUrl } from "../storage/useAsset";
import { IconButton, SceneArt } from "./common";

export type UpdateProject = (
  update: (project: StoryProject) => StoryProject,
) => void;
type Props = {
  project: StoryProject;
  update: UpdateProject;
  activeId?: string;
  selectScene(key: string): void;
  onRebuild(source: string, title: string, settings: GenerationSettings): void;
  upload(
    file: File,
    kind: "image" | "audio",
    setAsset: (
      p: StoryProject,
      key?: string,
      duration?: number,
    ) => StoryProject,
  ): void;
  config: ProviderConfig;
  setConfig(value: ProviderConfig): void;
  tasks: GenerationTask[];
  generating: boolean;
  generate(scenes: Scene[], force?: boolean): void;
  cancel(): void;
  reference(characterId: string): void;
};

export function Editor(props: Props) {
  const {
    project,
    update,
    config,
    setConfig,
    tasks,
    generating,
    generate,
    cancel,
  } = props;
  const [section, setSection] = useState<
    "scene" | "text" | "subtitle" | "character"
  >("scene");
  const [source, setSource] = useState(project.source);
  const [title, setTitle] = useState(project.title);
  const [settings, setSettings] = useState(project.generation);
  const [dragged, setDragged] = useState<string>();
  const scene =
    project.scenes.find((item) => item.sceneId === props.activeId) ??
    project.scenes[0];
  const url = useAssetUrl(scene?.assetId);
  const task = tasks.find((item) => item.sceneId === scene?.sceneId);
  const unfinished = project.scenes.filter(
    (s) =>
      !s.assetId ||
      tasks.some(
        (t) =>
          t.sceneId === s.sceneId &&
          ["failed", "pending", "running", "cancelled"].includes(t.status),
      ),
  );
  const patchScene = (change: Partial<Scene>) =>
    update((p) => ({
      ...p,
      scenes: p.scenes.map((item) =>
        item.sceneId === scene?.sceneId ? { ...item, ...change } : item,
      ),
    }));
  const reorder = (from: string, to: string) => {
    if (from === to) return;
    update((p) => {
      const old = p.scenes.findIndex((s) => s.sceneId === from);
      const next = p.scenes.findIndex((s) => s.sceneId === to);
      if (old < 0 || next < 0) return p;
      const scenes = p.scenes.slice();
      const [moved] = scenes.splice(old, 1);
      scenes.splice(next, 0, moved);
      return reorderTimeline(p, ordered(scenes));
    });
  };
  const addScene = (copy = false) => {
    const next =
      copy && scene
        ? { ...scene, sceneId: id(), relatedDialogueIds: [] }
        : blankScene(project.scenes.length);
    update((p) => ({
      ...p,
      scenes: [...p.scenes, { ...next, sceneOrder: p.scenes.length }],
    }));
    props.selectScene(next.sceneId);
  };
  const remove = () => {
    if (!scene || project.scenes.length < 2) return;
    update((p) => {
      const scenes = ordered(
        p.scenes.filter((s) => s.sceneId !== scene.sceneId),
      );
      const replacement =
        scenes[Math.min(scene.sceneOrder, scenes.length - 1)].sceneId;
      const cues = p.cues.map((cue) =>
        cue.sceneId === scene.sceneId ? { ...cue, sceneId: replacement } : cue,
      );
      return { ...p, scenes: linkTurns(p, scenes, cues), cues };
    });
  };
  const importImage = (file?: File) => {
    if (!file || !scene) return;
    props.upload(file, "image", (p, key) => ({
      ...p,
      scenes: p.scenes.map((item) =>
        item.sceneId === scene.sceneId && key
          ? {
              ...item,
              assetId: key,
              imageVersions: [...new Set([...item.imageVersions, key])],
              imageStatus: "ready",
              generationProvider: "upload",
              generationVersion: item.generationVersion + 1,
            }
          : item,
      ),
    }));
  };

  return (
    <section className="editor">
      <nav className="editor-tabs tabs" aria-label="编辑内容">
        {(
          [
            ["scene", "分镜与图片"],
            ["text", "原始对话"],
            ["subtitle", "字幕与对齐"],
            ["character", "人物设定"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={section === key}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {section === "text" && (
        <div className="panel edit-form">
          <label>
            故事名称
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            原始对话
            <textarea
              rows={13}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <GenerationFields value={settings} onChange={setSettings} />
          <div className="actions">
            <button
              className="primary"
              onClick={() => props.onRebuild(source, title, settings)}
            >
              <Sparkles size={16} /> 重新规划分镜
            </button>
          </div>
          <p className="muted">
            重新规划会创建一个新项目。可在项目库中继续访问现有版本。
          </p>
          <h3>已解析人物</h3>
          {project.speakers.map((speaker) => (
            <label key={speaker.id}>
              {speaker.id}
              <input
                aria-label={`${speaker.name} 显示名称`}
                value={speaker.name}
                onChange={(e) => {
                  const name = e.target.value;
                  update((p) => ({
                    ...p,
                    speakers: p.speakers.map((s) =>
                      s.id === speaker.id ? { ...s, name } : s,
                    ),
                  }));
                }}
              />
            </label>
          ))}
        </div>
      )}
      {section === "scene" && (
        <>
          <div className="panel generation-panel">
            <div className="section-head">
              <div>
                <h2>图片生成</h2>
                <p>自动生成使用私有代理。也可以直接上传图片。</p>
              </div>
              <div className="actions">
                {generating && (
                  <button onClick={cancel}>
                    <X size={16} /> 取消
                  </button>
                )}
                <button
                  className="primary"
                  disabled={
                    generating || !config.endpoint || !unfinished.length
                  }
                  onClick={() => generate(unfinished)}
                >
                  <Sparkles size={16} /> 生成或继续 ({unfinished.length})
                </button>
              </div>
            </div>
            <details>
              <summary>图片代理设置</summary>
              <div className="field-grid">
                <label>
                  代理 URL
                  <input
                    type="url"
                    placeholder="http://127.0.0.1:8194/image"
                    value={config.endpoint}
                    onChange={(e) =>
                      setConfig({ ...config, endpoint: e.target.value })
                    }
                  />
                </label>
                <label>
                  模型
                  <input
                    value={config.model}
                    placeholder="代理默认模型"
                    onChange={(e) =>
                      setConfig({ ...config, model: e.target.value })
                    }
                  />
                </label>
                <label>
                  并发数
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={config.concurrency}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        concurrency: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  每张估计费用（美元）
                  <input
                    type="number"
                    min="0"
                    step=".01"
                    value={config.unitPrice}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        unitPrice: Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  WebP 压缩
                  <select
                    value={config.webpQuality}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        webpQuality: Number(e.target.value),
                      })
                    }
                  >
                    <option value="0">保留原图</option>
                    <option value=".92">高画质</option>
                    <option value=".75">节省空间</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={config.supportsReferences}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        supportsReferences: e.target.checked,
                      })
                    }
                  />{" "}
                  代理支持角色参考图
                </label>
              </div>
              {!config.supportsReferences && (
                <p className="muted">
                  当前使用文字角色描述，镜头之间的外观一致性可能有限。
                </p>
              )}
              <p className="muted">
                本批费用上限估算{" "}
                {config.unitPrice > 0
                  ? `$${(unfinished.length * config.unitPrice).toFixed(2)}`
                  : "待填写单价"}
                。费用取决于代理计费和缓存命中。
              </p>
            </details>
            {tasks.length > 0 && (
              <p role="status">
                已完成 {tasks.filter((t) => t.status === "done").length} /{" "}
                {tasks.length} · 失败{" "}
                {tasks.filter((t) => t.status === "failed").length} · 已取消{" "}
                {tasks.filter((t) => t.status === "cancelled").length}
              </p>
            )}
          </div>
          <div className="edit-grid">
            <aside className="panel scene-menu">
              <div className="section-head">
                <h2>镜头</h2>
                <IconButton label="添加镜头" onClick={() => addScene()}>
                  <Plus size={18} />
                </IconButton>
              </div>
              {project.scenes.map((item) => (
                <button
                  key={item.sceneId}
                  className="scene-menu-row"
                  aria-current={item.sceneId === scene?.sceneId}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.sceneId);
                    setDragged(item.sceneId);
                  }}
                  onDragEnd={() => setDragged(undefined)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragged) reorder(dragged, item.sceneId);
                    setDragged(undefined);
                  }}
                  onClick={() => props.selectScene(item.sceneId)}
                >
                  <GripVertical size={15} />
                  <span>{String(item.sceneOrder + 1).padStart(2, "0")}</span>
                  {item.descriptionZh || item.descriptionEn || "未命名镜头"}
                </button>
              ))}
            </aside>
            {scene && (
              <div className="panel edit-form">
                <div className="section-head">
                  <h2>镜头 {scene.sceneOrder + 1}</h2>
                  <div className="actions">
                    <IconButton
                      label="上移镜头"
                      disabled={!project.scenes[scene.sceneOrder - 1]}
                      onClick={() =>
                        reorder(
                          scene.sceneId,
                          project.scenes[scene.sceneOrder - 1].sceneId,
                        )
                      }
                    >
                      <ArrowUp size={17} />
                    </IconButton>
                    <IconButton
                      label="下移镜头"
                      disabled={!project.scenes[scene.sceneOrder + 1]}
                      onClick={() =>
                        reorder(
                          scene.sceneId,
                          project.scenes[scene.sceneOrder + 1].sceneId,
                        )
                      }
                    >
                      <ArrowDown size={17} />
                    </IconButton>
                    <IconButton label="复制镜头" onClick={() => addScene(true)}>
                      <Copy size={16} />
                    </IconButton>
                    <IconButton
                      label="删除镜头"
                      disabled={project.scenes.length < 2}
                      onClick={remove}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
                <div className="frame editor-preview">
                  <SceneArt url={url} scene={scene} />
                </div>
                <div className="actions">
                  <label className="button upload">
                    <ImagePlus size={16} /> 上传 / 替换图片
                    <input
                      aria-label="上传场景图片"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                      onChange={(e) => {
                        importImage(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    disabled={
                      !config.endpoint || !scene.imagePrompt || generating
                    }
                    onClick={() => generate([scene], true)}
                  >
                    <Sparkles size={16} /> 重新生成图片
                  </button>
                  <button
                    disabled={!scene.imagePrompt}
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(scene.imagePrompt)
                        .catch(() => {})
                    }
                  >
                    <Copy size={16} /> 复制提示词
                  </button>
                  {url && (
                    <a
                      className="button"
                      href={url}
                      download={`scene-${scene.sceneOrder + 1}`}
                    >
                      <Download size={16} /> 下载原图
                    </a>
                  )}
                </div>
                {task?.error && <p role="alert">{task.error}</p>}
                <div className="field-grid">
                  <label>
                    中文说明
                    <input
                      value={scene.descriptionZh}
                      onChange={(e) =>
                        patchScene({ descriptionZh: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    英文说明
                    <input
                      value={scene.descriptionEn}
                      onChange={(e) =>
                        patchScene({ descriptionEn: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    地点
                    <input
                      value={scene.location}
                      onChange={(e) => patchScene({ location: e.target.value })}
                    />
                  </label>
                  <label>
                    景别
                    <input
                      value={scene.cameraShot}
                      onChange={(e) =>
                        patchScene({ cameraShot: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    镜头角度
                    <input
                      value={scene.cameraAngle}
                      onChange={(e) =>
                        patchScene({ cameraAngle: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    表情
                    <input
                      value={scene.emotion}
                      onChange={(e) => patchScene({ emotion: e.target.value })}
                    />
                  </label>
                  <label>
                    画面动作
                    <input
                      value={scene.visualAction}
                      onChange={(e) =>
                        patchScene({ visualAction: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    图片锚点
                    <select
                      value={scene.position}
                      onChange={(e) => patchScene({ position: e.target.value })}
                    >
                      {[
                        ["50% 50%", "居中"],
                        ["50% 0%", "顶部"],
                        ["50% 100%", "底部"],
                        ["0% 50%", "左侧"],
                        ["100% 50%", "右侧"],
                      ].map(([key, text]) => (
                        <option key={key} value={key}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    图片缩放 {scene.zoom.toFixed(2)}×
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step=".05"
                      value={scene.zoom}
                      onChange={(e) =>
                        patchScene({ zoom: Number(e.target.value) })
                      }
                    />
                  </label>
                  {scene.imageVersions.length > 0 && (
                    <label>
                      图片版本
                      <select
                        value={scene.assetId}
                        onChange={(e) =>
                          patchScene({ assetId: e.target.value })
                        }
                      >
                        {scene.imageVersions.map((key, index) => (
                          <option key={key} value={key}>
                            版本 {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <fieldset>
                  <legend>画面角色或道具</legend>
                  <div className="actions">
                    {project.characters.map((character) => (
                      <label key={character.id} className="check">
                        <input
                          type="checkbox"
                          checked={scene.characters.includes(character.id)}
                          onChange={(e) =>
                            patchScene({
                              characters: e.target.checked
                                ? [...scene.characters, character.id]
                                : scene.characters.filter(
                                    (key) => key !== character.id,
                                  ),
                            })
                          }
                        />
                        {character.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  图片提示词
                  <textarea
                    rows={4}
                    value={scene.imagePrompt}
                    onChange={(e) =>
                      patchScene({ imagePrompt: e.target.value })
                    }
                  />
                </label>
                <label>
                  负面提示词
                  <input
                    value={scene.negativePrompt}
                    onChange={(e) =>
                      patchScene({ negativePrompt: e.target.value })
                    }
                  />
                </label>
                <div className="actions">
                  <button
                    onClick={() =>
                      patchScene({
                        imagePrompt: makePrompt(
                          scene,
                          project.characters,
                          project.generation.style,
                        ),
                      })
                    }
                  >
                    从镜头与人物设定刷新提示词
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {section === "subtitle" && (
        <div className="panel subtitle-editor">
          <h2>字幕与双语对齐</h2>
          <p className="muted">
            将字幕移到同一对照组即可建立配对。时间为每种语言的逻辑时间。上传音频后以该音频实际播放结束为准。
          </p>
          {project.groups.map((group, groupIndex) => (
            <details
              key={group.id}
              className="alignment"
              open={groupIndex === 0 || undefined}
            >
              <summary>
                对照组 {groupIndex + 1} · {group.zh.length} 中 /{" "}
                {group.en.length} 英 ·{" "}
                {group.confidence
                  ? `置信度 ${Math.round(group.confidence * 100)}%`
                  : "未配对 / 手动调整"}
                {group.confidence < 0.45 && " · 建议核对"}
              </summary>
              {project.cues
                .filter((cue) => cue.alignmentGroupId === group.id)
                .map((cue) => (
                  <CueEditor
                    key={cue.subtitleId}
                    cue={cue}
                    project={project}
                    patch={(change) =>
                      update((p) => updateCue(p, cue.subtitleId, change))
                    }
                    addGroup={() =>
                      update((p) => {
                        const key = id();
                        return updateCue(
                          {
                            ...p,
                            groups: [
                              ...p.groups,
                              { id: key, zh: [], en: [], confidence: 0 },
                            ],
                          },
                          cue.subtitleId,
                          { alignmentGroupId: key },
                        );
                      })
                    }
                    upload={props.upload}
                  />
                ))}
            </details>
          ))}
        </div>
      )}
      {section === "character" && (
        <div className="panel edit-form">
          <div className="section-head">
            <h2>人物设定表</h2>
            <button
              onClick={() =>
                update((p) => ({
                  ...p,
                  characters: [
                    ...p.characters,
                    { id: id(), name: "新角色", description: "" },
                  ],
                }))
              }
            >
              <Plus size={16} /> 添加人物
            </button>
          </div>
          {project.characters.map((character) => (
            <CharacterRow
              key={character.id}
              character={character}
              update={update}
              upload={props.upload}
              generate={() => props.reference(character.id)}
              canGenerate={Boolean(config.endpoint) && !generating}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ordered(list: Scene[]) {
  return list.map((scene, sceneOrder) => ({ ...scene, sceneOrder }));
}

function linkTurns(
  project: StoryProject,
  scenes: Scene[],
  cues: SubtitleCue[],
) {
  const turnByCue = new Map(project.segments.map((s) => [s.id, s.turnId]));
  const byScene = new Map<string, Set<string>>();
  for (const cue of cues) {
    const turn = turnByCue.get(cue.subtitleId);
    if (!turn) continue;
    const entry = byScene.get(cue.sceneId) ?? new Set<string>();
    entry.add(turn);
    byScene.set(cue.sceneId, entry);
  }
  return scenes.map((scene) => ({
    ...scene,
    relatedDialogueIds: [...(byScene.get(scene.sceneId) ?? [])],
  }));
}

function reorderTimeline(project: StoryProject, scenes: Scene[]) {
  const ranks = new Map(
    scenes.map((scene) => [scene.sceneId, scene.sceneOrder]),
  );
  const clock = { zh: 0, en: 0 };
  const cues = project.cues
    .slice()
    .sort((a, b) => (ranks.get(a.sceneId) ?? 0) - (ranks.get(b.sceneId) ?? 0))
    .map((cue, segmentOrder) => {
      const startTime = clock[cue.language];
      const endTime = startTime + cue.endTime - cue.startTime;
      clock[cue.language] = endTime;
      return { ...cue, startTime, endTime, segmentOrder };
    });
  const order = new Map<string, number>();
  for (const cue of cues)
    if (!order.has(cue.alignmentGroupId))
      order.set(cue.alignmentGroupId, cue.segmentOrder);
  const groups = project.groups
    .slice()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { ...project, scenes, cues, groups };
}

export function GenerationFields({
  value,
  onChange,
}: {
  value: GenerationSettings;
  onChange(value: GenerationSettings): void;
}) {
  return (
    <div className="field-grid">
      <label>
        分镜密度
        <select
          value={value.density}
          onChange={(e) =>
            onChange({
              ...value,
              density: e.target.value as GenerationSettings["density"],
            })
          }
        >
          <option value="compact">精简</option>
          <option value="standard">标准</option>
          <option value="rich">丰富</option>
          <option value="max">超丰富</option>
        </select>
      </label>
      <label>
        图片风格
        <select
          value={value.style}
          onChange={(e) => onChange({ ...value, style: e.target.value })}
        >
          {styles.map((style) => (
            <option key={style}>{style}</option>
          ))}
        </select>
      </label>
      <label>
        目标镜头时长（秒）
        <input
          type="number"
          min="1"
          max="30"
          value={value.targetSceneDurationSeconds}
          onChange={(e) =>
            onChange({
              ...value,
              targetSceneDurationSeconds: bounded(e.target.value, 30),
            })
          }
        />
      </label>
      <label>
        最多镜头数
        <input
          type="number"
          min="1"
          max="100"
          value={value.maxSceneCount}
          onChange={(e) =>
            onChange({ ...value, maxSceneCount: bounded(e.target.value, 100) })
          }
        />
      </label>
      <label>
        图片预算（张）
        <input
          type="number"
          min="1"
          max="100"
          value={value.imageCountBudget}
          onChange={(e) =>
            onChange({
              ...value,
              imageCountBudget: bounded(e.target.value, 100),
            })
          }
        />
      </label>
    </div>
  );
}
const bounded = (value: string, max: number) =>
  Math.max(1, Math.min(max, Math.round(Number(value))));

function updateCue(
  project: StoryProject,
  key: string,
  change: Partial<SubtitleCue>,
) {
  const cue = project.cues.find((c) => c.subtitleId === key);
  if (!cue) return project;
  const groups =
    change.alignmentGroupId && change.alignmentGroupId !== cue.alignmentGroupId
      ? project.groups
          .map((group) => {
            if (group.id === cue.alignmentGroupId)
              return {
                ...group,
                [cue.language]: group[cue.language].filter(
                  (key) => key !== cue.subtitleId,
                ),
                confidence: 0,
              };
            if (group.id === change.alignmentGroupId)
              return {
                ...group,
                [cue.language]: [...group[cue.language], cue.subtitleId],
                confidence: 0,
              };
            return group;
          })
          .filter((group) => group.zh.length || group.en.length)
      : project.groups;
  const cues = project.cues.map((c) =>
    c.subtitleId === key ? { ...c, ...change } : c,
  );
  return {
    ...project,
    groups,
    cues,
    scenes: change.sceneId
      ? linkTurns(project, project.scenes, cues)
      : project.scenes,
  };
}

function CueEditor({
  cue,
  project,
  patch,
  addGroup,
  upload,
}: {
  cue: SubtitleCue;
  project: StoryProject;
  patch(change: Partial<SubtitleCue>): void;
  addGroup(): void;
  upload: Props["upload"];
}) {
  const url = useAssetUrl(cue.audioAssetId);
  const speaker = project.speakers.find((s) => s.id === cue.speakerId);
  return (
    <div className="edit-form cue-form">
      <label>
        {speaker?.name ?? cue.speakerId} · {cue.language.toUpperCase()}
        <textarea
          rows={2}
          value={cue.text}
          onChange={(e) =>
            patch({ text: e.target.value, audioAssetId: undefined })
          }
        />
      </label>
      <div className="field-grid">
        <label>
          对应镜头
          <select
            value={cue.sceneId}
            onChange={(e) => patch({ sceneId: e.target.value })}
          >
            {project.scenes.map((scene) => (
              <option value={scene.sceneId} key={scene.sceneId}>
                镜头 {scene.sceneOrder + 1} ·{" "}
                {(scene.descriptionZh || scene.descriptionEn).slice(0, 32)}
              </option>
            ))}
          </select>
        </label>
        <label>
          对应组
          <select
            value={cue.alignmentGroupId}
            onChange={(e) => {
              if (e.target.value === "new") addGroup();
              else {
                const match = project.cues.find(
                  (c) =>
                    c.alignmentGroupId === e.target.value &&
                    c.language !== cue.language,
                );
                patch({
                  alignmentGroupId: e.target.value,
                  ...(match ? { sceneId: match.sceneId } : {}),
                });
              }
            }}
          >
            {project.groups.map((group, index) => (
              <option value={group.id} key={group.id}>
                对照组 {index + 1}
              </option>
            ))}
            <option value="new">移到新组</option>
          </select>
        </label>
        <label>
          开始秒数
          <input
            type="number"
            min="0"
            max={cue.endTime - 0.15}
            step=".05"
            value={Number(cue.startTime.toFixed(2))}
            onChange={(e) =>
              patch({
                startTime: Math.max(
                  0,
                  Math.min(cue.endTime - 0.15, Number(e.target.value)),
                ),
              })
            }
          />
        </label>
        <label>
          结束秒数
          <input
            type="number"
            min={cue.startTime + 0.15}
            step=".05"
            value={Number(cue.endTime.toFixed(2))}
            onChange={(e) =>
              patch({
                endTime: Math.max(cue.startTime + 0.15, Number(e.target.value)),
              })
            }
          />
        </label>
      </div>
      <div className="actions">
        <label className="button upload">
          上传音频
          <input
            aria-label="上传字幕音频"
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                upload(file, "audio", (p, key, duration) =>
                  updateCue(p, cue.subtitleId, {
                    audioAssetId: key,
                    ...(duration ? { endTime: cue.startTime + duration } : {}),
                  }),
                );
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <>
            <audio controls src={url} preload="metadata" />
            <button onClick={() => patch({ audioAssetId: undefined })}>
              移除音频
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CharacterRow({
  character,
  update,
  upload,
  generate,
  canGenerate,
}: {
  character: StoryProject["characters"][number];
  update: UpdateProject;
  upload: Props["upload"];
  generate(): void;
  canGenerate: boolean;
}) {
  const url = useAssetUrl(character.referenceAssetId);
  const patch = (change: Partial<typeof character>) =>
    update((p) => ({
      ...p,
      characters: p.characters.map((c) =>
        c.id === character.id ? { ...c, ...change } : c,
      ),
    }));
  return (
    <div className="character-row">
      <div className="character-ref">
        {url ? <img src={url} alt={character.name} loading="lazy" /> : "参考图"}
      </div>
      <div className="edit-form">
        <label>
          角色名称
          <input
            value={character.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label>
          外观与道具
          <textarea
            rows={2}
            value={character.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        <div className="actions">
          <label className="button upload">
            <ImagePlus size={16} /> 上传参考图
            <input
              type="file"
              aria-label="上传角色参考图"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  upload(file, "image", (p, key) => ({
                    ...p,
                    characters: p.characters.map((c) =>
                      c.id === character.id
                        ? { ...c, referenceAssetId: key }
                        : c,
                    ),
                  }));
                e.target.value = "";
              }}
            />
          </label>
          <button
            disabled={!canGenerate || !character.description}
            onClick={generate}
          >
            生成参考图
          </button>
          {url && (
            <button onClick={() => patch({ referenceAssetId: undefined })}>
              移除参考图
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
