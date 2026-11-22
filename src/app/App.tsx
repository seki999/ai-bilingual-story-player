import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Clapperboard,
  Download,
  Film,
  FolderOpen,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";
import { Player } from "../components/Player";
import { Editor, GenerationFields } from "../components/Editor";
import { Settings } from "../components/Settings";
import {
  createAlignedStory,
  createStory,
  generationDefaults,
  playerDefaults,
  withSubtitleDefaults,
} from "../core/storyboard";
import { ProxyAlignmentProvider } from "../providers/alignment";
import {
  makeTimeline,
  PlaybackEngine,
  type PlayHandle,
  type Snapshot,
} from "../core/playback";
import { id } from "../core/dialogue";
import { BrowserTts } from "../providers/tts";
import {
  generateImage,
  optimizeImage,
  ProxyImageProvider,
  referenceRequest,
} from "../providers/images";
import { ImageQueue } from "../providers/queue";
import { db, removeProject, selectionKey } from "../storage/db";
import {
  loadCatalog,
  openPublished,
  type PublishedStory,
} from "../storage/catalog";
import {
  download,
  exportStory,
  importStory,
  permitsAsset,
} from "../storage/archive";
import type {
  Asset,
  GenerationSettings,
  GenerationTask,
  Mode,
  ProviderConfig,
  Scene,
  StoryProject,
} from "../types";
import demoText from "../demo.txt?raw";

const demoTitle = "鹦鹉餐厅闹剧";
const providerKey = "ai-bilingual-story-player:image-proxy:v1";
const alignmentKey = "ai-bilingual-story-player:alignment-proxy:v1";
const providerDefaults: ProviderConfig = {
  endpoint: "",
  model: "",
  supportsReferences: false,
  concurrency: 2,
  unitPrice: 0,
  webpQuality: 0,
};
type View = "player" | "editor" | "create" | "library" | "settings";
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function initialProvider() {
  try {
    return {
      ...providerDefaults,
      ...JSON.parse(localStorage.getItem(providerKey) ?? "{}"),
    } as ProviderConfig;
  } catch {
    return providerDefaults;
  }
}

async function makeDemo() {
  const p = createStory(demoTitle, demoText);
  p.id = "demo-parakeet-v1";
  p.player.mode = "mixed";
  const shotArt: [string, RegExp][] = [
    ["arrival", /带进|brought|entered/i],
    ["recording", /拍了|recorded|拍摄/i],
    ["reaction", /哈哈|hahaha|ridiculous/i],
    ["protest", /报警|call the police|我是 customer/i],
  ];
  const scenes = new Map([[p.scenes[0].sceneId, "parakeet"]]);
  for (const [art, pattern] of shotArt) {
    const scene = p.scenes.find(
      (s) =>
        !scenes.has(s.sceneId) &&
        pattern.test(s.descriptionZh + " " + s.descriptionEn),
    );
    if (scene) scenes.set(scene.sceneId, art);
  }
  const assets = (
    await Promise.all(
      p.scenes.map(async (scene) => {
        const art = scenes.get(scene.sceneId);
        if (!art) return;
        try {
          const response = await fetch(
            `${import.meta.env.BASE_URL}demo/${art}.webp`,
          );
          const blob = await response.blob();
          if (!response.ok || !permitsAsset(blob.type, "image")) return;
          const assetId = `demo-${art}-v1`;
          Object.assign(scene, {
            assetId,
            imageVersions: [assetId],
            imageStatus: "ready",
            generationProvider: "demo-art",
          });
          return { id: assetId, blob, kind: "image" } as const;
        } catch {
          return;
        }
      }),
    )
  ).filter((asset) => asset !== undefined);
  await db.transaction("rw", db.assets, db.projects, async () => {
    await db.assets.bulkPut(assets);
    await db.projects.put(p);
  });
  return p;
}

export function App() {
  const [project, setProject] = useState<StoryProject>();
  const current = useRef<StoryProject | undefined>(undefined);
  const [library, setLibrary] = useState<StoryProject[]>([]);
  const [published, setPublished] = useState<PublishedStory[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [view, setView] = useState<View>("player");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeScene, setActiveScene] = useState<string>();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voiceList = useRef(voices);
  const [config, setConfig] = useState(initialProvider);
  const [alignmentEndpoint, setAlignmentEndpoint] = useState(
    () => localStorage.getItem(alignmentKey) ?? "",
  );
  const [snapshot, setSnapshot] = useState<Snapshot>({
    status: "idle",
    index: 0,
    elapsed: 0,
  });
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [generating, setGenerating] = useState(false);
  const [queue] = useState(() => new ImageQueue());
  const [engine] = useState(
    () =>
      new PlaybackEngine(
        { entries: [], duration: 0 },
        createSettings(),
        {
          play: (cue, settings, events, elapsed) =>
            new BrowserTts(
              current.current?.speakers ?? [],
              voiceList.current,
            ).play(cue, settings, events, elapsed),
        },
        setSnapshot,
      ),
  );
  const importInput = useRef<HTMLInputElement>(null);
  const previewHandle = useRef<PlayHandle | undefined>(undefined);
  const referenceController = useRef<AbortController | undefined>(undefined);
  const previewSession = useRef(0);
  const writes = useRef(Promise.resolve());

  const refreshLibrary = useCallback(
    async () =>
      setLibrary(await db.projects.orderBy("updatedAt").reverse().toArray()),
    [],
  );
  const refreshTasks = useCallback(async (key: string) => {
    const rows = await db.tasks.where("projectId").equals(key).toArray();
    if (current.current?.id === key) setTasks(rows);
  }, []);
  const accept = useCallback(
    (p: StoryProject, reset = false) => {
      const before = current.current;
      const oldEntry = engine.timeline.entries[engine.snapshot.index];
      const wasPlaying = ["playing", "preparing"].includes(
        engine.snapshot.status,
      );
      current.current = p;
      setProject(p);
      const prev = before?.player;
      const changeSequence =
        !prev ||
        prev.mode !== p.player.mode ||
        prev.order !== p.player.order ||
        prev.follow !== p.player.follow ||
        prev.zhRepeats !== p.player.zhRepeats ||
        prev.enRepeats !== p.player.enRepeats ||
        prev.gap !== p.player.gap;
      const restart =
        changeSequence ||
        prev?.rate !== p.player.rate ||
        prev.volume !== p.player.volume ||
        prev.voices !== p.player.voices ||
        prev.voiceGenders !== p.player.voiceGenders ||
        before?.cues !== p.cues ||
        before.groups !== p.groups;
      engine.settings = p.player;
      if (!reset && !restart) return;
      const timeline = makeTimeline(p);
      engine.timeline = timeline;
      if (!timeline.entries.length) {
        engine.stop();
        return;
      }
      const startEnglishPair =
        !reset &&
        p.player.mode === "mixed" &&
        p.player.order === "paired-en-first" &&
        (prev?.mode !== p.player.mode || prev.order !== p.player.order);
      const pairStart = startEnglishPair
        ? timeline.entries.findIndex(
            (entry) =>
              entry.cue.alignmentGroupId === oldEntry?.cue.alignmentGroupId,
          )
        : -1;
      const exact = timeline.entries.findIndex(
        (entry) =>
          entry.cue.subtitleId ===
          (reset ? p.progress : oldEntry?.cue.subtitleId),
      );
      const aligned = timeline.entries.findIndex(
        (entry) =>
          entry.cue.alignmentGroupId === oldEntry?.cue.alignmentGroupId &&
          entry.cue.sceneId === oldEntry?.cue.sceneId,
      );
      const related = timeline.entries.findIndex(
        (entry) => entry.cue.sceneId === oldEntry?.cue.sceneId,
      );
      engine.seek(
        pairStart >= 0
          ? pairStart
          : exact >= 0
            ? exact
            : reset
              ? 0
              : Math.max(0, aligned >= 0 ? aligned : related),
        !reset && wasPlaying,
      );
    },
    [engine],
  );

  const loadProject = useCallback(
    (p: StoryProject, showPlayer = true) => {
      previewSession.current++;
      previewHandle.current?.stop();
      queue.cancel();
      referenceController.current?.abort();
      engine.stop();
      setTasks([]);
      setActiveScene(undefined);
      setError("");
      setNotice("");
      accept({ ...p, player: withSubtitleDefaults(p.player) }, true);
      localStorage.setItem(selectionKey, p.id);
      void refreshTasks(p.id).catch((e) => setError(message(e)));
      if (showPlayer) setView("player");
    },
    [accept, engine, queue, refreshTasks],
  );

  useEffect(() => {
    let open = true;
    void (async () => {
      let stories = await db.projects.orderBy("updatedAt").reverse().toArray();
      if (!stories.length) stories = [await makeDemo()];
      if (!open) return;
      setLibrary(stories);
      loadProject(
        stories.find((p) => p.id === localStorage.getItem(selectionKey)) ??
          stories[0],
        false,
      );
    })().catch((e) => {
      if (open) setError(message(e));
    });
    return () => {
      open = false;
      engine.dispose();
      queue.cancel();
      referenceController.current?.abort();
      previewHandle.current?.stop();
    };
  }, [engine, loadProject, queue]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => {
      voiceList.current = synth.getVoices();
      setVoices(voiceList.current);
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  // Serialize local edits and merge each patch against the latest stored project.
  function update(change: (p: StoryProject) => StoryProject) {
    const before = current.current;
    if (!before) return;
    writes.current = writes.current
      .then(async () => {
        const latest = await db.transaction("rw", db.projects, async () => {
          const stored = await db.projects.get(before.id);
          if (!stored) return;
          const live = current.current;
          const base =
            live?.id === before.id
              ? {
                  ...live,
                  scenes: stored.scenes,
                  characters: stored.characters,
                }
              : stored;
          const p = { ...change(base), updatedAt: Date.now() };
          await db.projects.put(p);
          return p;
        });
        if (latest && current.current?.id === latest.id) accept(latest);
      })
      .catch((e) => setError(message(e)));
  }

  useEffect(() => {
    const p = current.current;
    const cue = engine.timeline.entries[snapshot.index]?.cue;
    if (!p || !cue || p.progress === cue.subtitleId) return;
    const timer = setTimeout(() => {
      if (current.current?.id !== p.id) return;
      current.current = { ...current.current, progress: cue.subtitleId };
      writes.current = writes.current
        .then(async () => {
          await db.projects.update(p.id, { progress: cue.subtitleId });
        })
        .catch((e) => setError(message(e)));
    }, 80);
    return () => clearTimeout(timer);
  }, [
    snapshot.index,
    project?.id,
    project?.player.mode,
    project?.player.order,
    engine,
  ]);

  function open(view: View) {
    if (view !== "player") engine.pause();
    previewSession.current++;
    previewHandle.current?.stop();
    setError("");
    setNotice("");
    setView(view);
    if (view === "library") {
      void refreshLibrary().catch((e) => setError(message(e)));
      setCatalogError("");
      void loadCatalog()
        .then(setPublished)
        .catch((e) => setCatalogError(message(e)));
    }
  }

  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function build(source: string, title: string, settings: GenerationSettings) {
    void action(async () => {
      const result = alignmentEndpoint
        ? await createAlignedStory(
            title,
            source,
            settings,
            new ProxyAlignmentProvider(alignmentEndpoint),
          )
        : { project: createStory(title, source, settings), fallback: "" };
      const p = result.project;
      await db.projects.put(p);
      await refreshLibrary();
      loadProject(p);
      setNotice(
        `已生成 ${p.scenes.length} 个镜头和 ${p.cues.length} 段字幕。${result.fallback ? `已回退到本地对齐（${result.fallback}）。` : ""}`,
      );
    });
  }
  function changePlayer(change: Partial<StoryProject["player"]>) {
    update((p) => ({ ...p, player: { ...p.player, ...change } }));
  }
  function changeMode(mode: Mode) {
    changePlayer({ mode });
  }

  async function generate(scenes: Scene[], force = false) {
    const key = current.current?.id;
    if (!key) return;
    setError("");
    try {
      await writes.current;
      const referenceErrors = await queue.run(
        key,
        scenes.filter((scene) => scene.imagePrompt.trim()),
        config,
        () => {
          setGenerating(queue.active || Boolean(referenceController.current));
          void refreshTasks(key).catch((e) => setError(message(e)));
        },
        force,
      );
      await writes.current;
      const p = await db.projects.get(key);
      if (p && current.current?.id === key) {
        accept({
          ...current.current,
          scenes: p.scenes,
          characters: p.characters,
        });
        if (referenceErrors?.length)
          setNotice(
            `部分参考图未生成，相关镜头已使用文字设定：${referenceErrors.join("、")}`,
          );
      }
    } catch (e) {
      setError(message(e));
    }
  }
  async function reference(characterId: string) {
    const p = current.current;
    const character = p?.characters.find((c) => c.id === characterId);
    if (!p || !character || queue.active || referenceController.current) return;
    const controller = new AbortController();
    referenceController.current = controller;
    setGenerating(true);
    setError("");
    try {
      const asset = await generateImage(
        new ProxyImageProvider(config),
        referenceRequest(character, p.generation.style),
        config.webpQuality,
        controller.signal,
      );
      if (current.current?.id === p.id)
        update((latest) => ({
          ...latest,
          characters: latest.characters.map((c) =>
            c.id === characterId ? { ...c, referenceAssetId: asset.id } : c,
          ),
        }));
    } catch (e) {
      if (!controller.signal.aborted) setError(message(e));
    } finally {
      referenceController.current = undefined;
      setGenerating(queue.active);
    }
  }

  async function upload(
    file: File,
    kind: Asset["kind"],
    attach: (p: StoryProject, key?: string, duration?: number) => StoryProject,
  ) {
    const projectId = current.current?.id;
    await action(async () => {
      if (
        !projectId ||
        !permitsAsset(file.type, kind) ||
        file.size > 35 * 1024 * 1024
      )
        throw new Error("请选择不超过 35 MB 的受支持图片或音频。");
      const key = id();
      const blob =
        kind === "image" ? await optimizeImage(file, config.webpQuality) : file;
      const audioDuration = kind === "audio" ? await measure(blob) : undefined;
      await db.assets.put({ id: key, blob, kind });
      if (current.current?.id === projectId) {
        update((p) => attach(p, key, audioDuration));
        await writes.current;
        setNotice("资源已保存。");
      }
    });
  }
  async function preview(speakerId: string) {
    const p = current.current;
    const cue = p?.cues.find((c) => c.speakerId === speakerId && c.text.trim());
    if (!p || !cue) return;
    const version = ++previewSession.current;
    engine.stop();
    previewHandle.current?.stop();
    try {
      const handle = await new BrowserTts(p.speakers, voiceList.current).play(
        { ...cue, audioAssetId: undefined },
        p.player,
        {
          start() {},
          time() {},
          end() {},
          error: setError,
        },
      );
      if (version === previewSession.current) previewHandle.current = handle;
      else handle.stop();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="top-inner">
          <button className="brand" onClick={() => open("player")}>
            <span className="brand-mark">
              <Film size={22} />
            </span>
            <span>
              Story Player<small>AI BILINGUAL</small>
            </span>
          </button>
          <nav className="top-nav" aria-label="主导航">
            <button
              aria-label="播放器"
              aria-current={view === "player" ? "page" : undefined}
              onClick={() => open("player")}
            >
              <Clapperboard size={17} />
              <span>播放器</span>
            </button>
            <button
              aria-label="故事编辑器"
              aria-current={view === "editor" ? "page" : undefined}
              disabled={!project}
              onClick={() => open("editor")}
            >
              <Film size={17} />
              <span>故事编辑器</span>
            </button>
            <button
              aria-label="项目库"
              aria-current={view === "library" ? "page" : undefined}
              onClick={() => open("library")}
            >
              <FolderOpen size={17} />
              <span>项目库</span>
            </button>
          </nav>
          <div className="top-actions">
            <button
              aria-current={view === "settings" ? "page" : undefined}
              disabled={!project}
              onClick={() => open("settings")}
            >
              设置
            </button>
            <button
              className="primary"
              aria-label="新建故事"
              onClick={() => open("create")}
            >
              <Plus size={18} />
              <span>新建故事</span>
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="heading">
          <div>
            <div className="eyebrow">
              <BookOpen size={15} />{" "}
              {view === "player"
                ? "双语故事"
                : view === "editor"
                  ? "故事工作台"
                  : "双语故事播放器"}
            </div>
            <h1>
              {view === "create"
                ? "新建故事"
                : view === "library"
                  ? "项目库"
                  : view === "settings"
                    ? "设置"
                    : (project?.title ?? "故事播放器")}
            </h1>
            {project && ["player", "editor"].includes(view) && (
              <p>
                {project.scenes.length} 个分镜 <span>·</span>{" "}
                {project.cues.length} 段字幕 <span>·</span>{" "}
                {project.id === "demo-parakeet-v1" ? "内置示例" : "本地项目"}
              </p>
            )}
          </div>
          <div className="heading-actions">
            {view === "player" && project && (
              <button onClick={() => open("library")}>
                <FolderOpen size={17} /> 选择故事
              </button>
            )}
            {view === "editor" && (
              <>
                <button onClick={() => open("player")}>预览故事</button>
                <button
                  className="primary"
                  onClick={() =>
                    void action(async () => {
                      await writes.current;
                      setNotice("项目已保存到此浏览器。");
                    })
                  }
                >
                  保存
                </button>
              </>
            )}
            {view === "library" && (
              <button
                onClick={() => importInput.current?.click()}
                disabled={busy}
              >
                <Upload size={17} /> 导入 ZIP
              </button>
            )}
            {project && ["player", "editor"].includes(view) && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await writes.current;
                    const p = current.current!;
                    const blob = await exportStory(p, (value) =>
                      setNotice(`正在导出 ${Math.round(value)}%`),
                    );
                    download(
                      blob,
                      `${p.title.replace(/[<>:"/\\|?*]/g, "_")}.zip`,
                    );
                    setNotice("故事包已导出。");
                  })
                }
              >
                <Download size={17} /> 导出
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="flash error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="flash" role="status">
            {notice}
          </div>
        )}
        <input
          ref={importInput}
          hidden
          aria-label="导入故事 ZIP"
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file)
              void action(async () => {
                const p = await importStory(file, (value) =>
                  setNotice(`正在导入 ${Math.round(value)}%`),
                );
                await refreshLibrary();
                loadProject(p);
                setNotice("已导入故事。");
              });
          }}
        />
        {view === "player" && project && (
          <Player
            project={project}
            engine={engine}
            snapshot={snapshot}
            onMode={changeMode}
            onSettings={changePlayer}
            onEdit={(sceneId) => {
              setActiveScene(sceneId);
              open("editor");
            }}
          />
        )}
        {view === "editor" && project && (
          <Editor
            key={project.id}
            project={project}
            update={update}
            activeId={activeScene}
            selectScene={setActiveScene}
            onRebuild={build}
            upload={(...args) => void upload(...args)}
            tasks={tasks}
            generating={generating}
            config={config}
            setConfig={(value) => {
              setConfig(value);
              localStorage.setItem(providerKey, JSON.stringify(value));
            }}
            generate={(...args) => void generate(...args)}
            cancel={() => {
              queue.cancel();
              referenceController.current?.abort();
            }}
            reference={(key) => void reference(key)}
          />
        )}
        {view === "create" && (
          <CreateStory
            onBuild={build}
            busy={busy}
            onImport={() => importInput.current?.click()}
          />
        )}
        {view === "settings" && project && (
          <Settings
            project={project}
            voices={voices}
            patch={changePlayer}
            preview={(key) => void preview(key)}
            alignmentEndpoint={alignmentEndpoint}
            setAlignmentEndpoint={(endpoint) => {
              setAlignmentEndpoint(endpoint);
              localStorage.setItem(alignmentKey, endpoint);
            }}
          />
        )}
        {view === "library" && (
          <section className="panel library">
            <h2>已发布故事</h2>
            {catalogError && <p className="muted">{catalogError}</p>}
            {!catalogError && published.length === 0 && (
              <p className="muted">暂无发布的故事。可以先体验鹦鹉餐厅 Demo。</p>
            )}
            {published.map((story) => (
              <div className="library-row" key={story.slug}>
                <button
                  className="project-link"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await writes.current;
                      const p = await openPublished(story, (value) =>
                        setNotice(`正在加载 ${Math.round(value)}%`),
                      );
                      loadProject(p);
                    })
                  }
                >
                  <span className="brand-mark">
                    <Clapperboard size={21} />
                  </span>
                  <span>
                    <strong>{story.title}</strong>
                    <small>{story.scenes} 个镜头</small>
                  </span>
                </button>
              </div>
            ))}
            <h2 className="local-library-heading">本地项目</h2>
            {library.map((p) => (
              <div className="library-row" key={p.id}>
                <button
                  className="project-link"
                  onClick={() =>
                    void action(async () => {
                      await writes.current;
                      loadProject((await db.projects.get(p.id)) ?? p);
                    })
                  }
                >
                  <span className="brand-mark">
                    <Clapperboard size={21} />
                  </span>
                  <span>
                    <strong>{p.title}</strong>
                    <small>
                      {p.scenes.length} 个镜头 · {p.cues.length} 段字幕
                    </small>
                  </span>
                </button>
                <div className="actions">
                  <button
                    onClick={() =>
                      void action(async () => {
                        const title = window
                          .prompt("新的故事名称", p.title)
                          ?.trim();
                        if (!title) return;
                        await writes.current;
                        await db.projects.update(p.id, {
                          title,
                          updatedAt: Date.now(),
                        });
                        if (current.current?.id === p.id)
                          accept({ ...current.current, title });
                        await refreshLibrary();
                      })
                    }
                  >
                    重命名
                  </button>
                  <button
                    onClick={() =>
                      void action(async () => {
                        await writes.current;
                        const source = await db.projects.get(p.id);
                        if (!source) throw new Error("找不到故事。");
                        await db.projects.put({
                          ...source,
                          id: id(),
                          title: `${source.title}（副本）`,
                          updatedAt: Date.now(),
                        });
                        await refreshLibrary();
                      })
                    }
                  >
                    复制
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      void action(async () => {
                        if (!window.confirm(`删除「${p.title}」？`)) return;
                        await writes.current;
                        if (current.current?.id === p.id) {
                          queue.cancel();
                          referenceController.current?.abort();
                          engine.stop();
                        }
                        await removeProject(p.id);
                        if (current.current?.id === p.id) {
                          current.current = undefined;
                          setProject(undefined);
                          localStorage.removeItem(selectionKey);
                        }
                        await refreshLibrary();
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            <div className="actions">
              <button
                onClick={() =>
                  void action(async () => {
                    const p =
                      (await db.projects.get("demo-parakeet-v1")) ??
                      (await makeDemo());
                    loadProject(p);
                  })
                }
              >
                <Clapperboard size={16} /> 打开鹦鹉餐厅 Demo
              </button>
            </div>
          </section>
        )}
      </main>
      <footer>
        AI Bilingual Story Player <span>·</span> 故事与资源保存在此浏览器
      </footer>
    </div>
  );
}

const createSettings = () => ({ ...playerDefaults, voices: {} });

function CreateStory({
  onBuild,
  busy,
  onImport,
}: {
  onBuild(source: string, title: string, settings: GenerationSettings): void;
  busy: boolean;
  onImport(): void;
}) {
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [settings, setSettings] = useState(generationDefaults);
  return (
    <form
      className="panel edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        onBuild(source, title, settings);
      }}
    >
      <label>
        故事名称
        <input
          value={title}
          placeholder="给你的故事起个名字"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        双语对话
        <textarea
          rows={13}
          required
          placeholder={
            "Speaker 1: 中文人物 A\nSpeaker 2: 中文人物 B\nSpeaker 3: English character A\nSpeaker 4: English character B"
          }
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <GenerationFields value={settings} onChange={setSettings} />
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          <Sparkles size={16} /> 生成分镜
        </button>
        <button
          type="button"
          onClick={() => {
            setSource(demoText);
            setTitle(demoTitle);
          }}
        >
          填入鹦鹉餐厅示例
        </button>
        <button type="button" onClick={onImport}>
          <Upload size={17} /> 导入 ZIP
        </button>
      </div>
    </form>
  );
}

function measure(blob: Blob) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    const finish = (duration?: number) => {
      clearTimeout(timer);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      if (duration && Number.isFinite(duration)) resolve(duration);
      else reject(new Error("无法读取音频时长。"));
    };
    const timer = setTimeout(() => finish(), 10_000);
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish();
    audio.src = url;
  });
}
