import { AudioLines } from "lucide-react";
import type { PlayerSettings, StoryProject } from "../types";

export function Settings({
  project,
  voices,
  patch,
  preview,
  alignmentEndpoint,
  setAlignmentEndpoint,
}: {
  project: StoryProject;
  voices: SpeechSynthesisVoice[];
  patch(change: Partial<PlayerSettings>): void;
  preview(id: string): void;
  alignmentEndpoint: string;
  setAlignmentEndpoint(endpoint: string): void;
}) {
  const settings = project.player;
  return (
    <section className="panel edit-form">
      <h2>播放设置</h2>
      <div className="field-grid">
        <label>
          字幕位置
          <select
            value={settings.subtitlePlacement}
            onChange={(e) =>
              patch({
                subtitlePlacement: e.target
                  .value as PlayerSettings["subtitlePlacement"],
              })
            }
          >
            <option value="overlay">图片内</option>
            <option value="below">图片下方</option>
          </select>
        </label>
        <label>
          中文字体
          <input
            value={settings.zhFont}
            onChange={(e) => patch({ zhFont: e.target.value })}
          />
        </label>
        <label>
          英文字体
          <input
            value={settings.enFont}
            onChange={(e) => patch({ enFont: e.target.value })}
          />
        </label>
        <label>
          循环模式
          <select
            value={settings.loop}
            onChange={(e) =>
              patch({ loop: e.target.value as PlayerSettings["loop"] })
            }
          >
            <option value="none">不循环</option>
            <option value="cue">当前句</option>
            <option value="scene">当前镜头</option>
            <option value="story">整篇故事</option>
            <option value="ab">A–B 范围</option>
          </select>
        </label>
        {settings.loop === "ab" && (
          <>
            <label>
              A 起始段
              <input
                type="number"
                min="1"
                value={settings.a}
                onChange={(e) =>
                  patch({ a: Math.max(1, Math.trunc(Number(e.target.value))) })
                }
              />
            </label>
            <label>
              B 结束段
              <input
                type="number"
                min="1"
                value={settings.b}
                onChange={(e) =>
                  patch({ b: Math.max(1, Math.trunc(Number(e.target.value))) })
                }
              />
            </label>
          </>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={settings.follow}
            onChange={(e) => patch({ follow: e.target.checked })}
          />{" "}
          中英跟读（混合模式）
        </label>
        {settings.follow && (
          <>
            <label>
              中文次数
              <input
                type="number"
                min="1"
                max="8"
                value={settings.zhRepeats}
                onChange={(e) => patch({ zhRepeats: repeats(e.target.value) })}
              />
            </label>
            <label>
              英语次数
              <input
                type="number"
                min="1"
                max="8"
                value={settings.enRepeats}
                onChange={(e) => patch({ enRepeats: repeats(e.target.value) })}
              />
            </label>
            <label>
              英语复读间隔（秒）
              <input
                type="number"
                min="0"
                max="60"
                step=".5"
                value={settings.gap}
                onChange={(e) =>
                  patch({
                    gap: Math.max(0, Math.min(60, Number(e.target.value))),
                  })
                }
              />
            </label>
          </>
        )}
      </div>
      <h3>自动对齐</h3>
      <label>
        结构化对齐代理 URL（可选）
        <input
          type="url"
          placeholder="http://127.0.0.1:8194/align"
          value={alignmentEndpoint}
          onChange={(e) => setAlignmentEndpoint(e.target.value)}
        />
      </label>
      <p className="muted">
        设置后，新建或重新规划时会将对话片段发送给该代理。留空使用本地启发式对齐。
      </p>
      <h3>人物语音</h3>
      <p className="muted">
        可选声音取决于浏览器与操作系统。系统语音的离线可用性因设备而异。
      </p>
      {project.speakers.map((speaker) => (
        <div className="voice-row" key={speaker.id}>
          <label>
            {speaker.name} · {speaker.language === "zh" ? "中文" : "English"}
            <select
              value={settings.voices[speaker.id] ?? ""}
              onChange={(e) =>
                patch({
                  voices: { ...settings.voices, [speaker.id]: e.target.value },
                })
              }
            >
              <option value="">自动选择</option>
              {voices
                .filter((voice) =>
                  voice.lang.toLowerCase().startsWith(speaker.language),
                )
                .map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
            </select>
          </label>
          <button onClick={() => preview(speaker.id)}>
            <AudioLines size={16} /> 试听
          </button>
        </div>
      ))}
    </section>
  );
}
const repeats = (value: string) =>
  Math.max(1, Math.min(8, Math.trunc(Number(value))));
