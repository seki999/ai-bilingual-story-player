import type { MediaEvents, PlayHandle, TtsProvider } from "../core/playback";
import type {
  PlayerSettings,
  Speaker,
  SubtitleCue,
  VoiceGender,
} from "../types";
import { db } from "../storage/db";

export function voiceGender(
  voice: SpeechSynthesisVoice,
): VoiceGender | undefined {
  const name = voice.name.toLowerCase();
  if (/\bfemale\b/.test(name)) return "female";
  if (/\bmale\b/.test(name)) return "male";
  if (
    /\b(?:david|mark|guy|ryan|eric|christopher|roger|stewie|kuanlin|yunxi|yunyang|yunjian|yunhao|yunfeng|yunxia|yunze|yunjie|yunjun|yunye|yunjia|yunjing|kangkang|alex|fred|tom|daniel)\b/.test(
      name,
    )
  )
    return "male";
  if (
    /\b(?:zira|aria|jenny|sara|libby|sonia|hazel|susan|linda|xiaoxiao|xiaoyi|xiaohan|xiaomeng|xiaomo|xiaoqiu|xiaorui|xiaoshuang|xiaoxuan|xiaoyan|xiaoyou|xiaozhen|xiaobei|huihui|yaoyao|hanhan|tingting|ting-ting|meijia|mei-jia|samantha|victoria|karen|moira|tessa|fiona|ava)\b/.test(
      name,
    )
  )
    return "female";
  return undefined;
}

export function assignVoices(
  speakers: Speaker[],
  choices: Record<string, string>,
  voices: SpeechSynthesisVoice[],
  genders: PlayerSettings["voiceGenders"] = {},
) {
  const used = new Set<string>();
  return new Map(
    speakers.map((speaker) => {
      const locale = speaker.language === "zh" ? "zh-cn" : "en-us";
      const available = voices
        .filter((voice) =>
          voice.lang.toLowerCase().startsWith(speaker.language),
        )
        .sort(
          (a, b) =>
            Number(b.lang.toLowerCase() === locale) -
            Number(a.lang.toLowerCase() === locale),
        );
      const preferred = genders[speaker.id];
      const matching = preferred
        ? available.filter((v) => voiceGender(v) === preferred)
        : [];
      const voice =
        available.find((v) => v.voiceURI === choices[speaker.id]) ??
        matching.find((v) => !used.has(v.voiceURI)) ??
        matching[0] ??
        available.find((v) => !used.has(v.voiceURI)) ??
        available[0];
      if (voice) used.add(voice.voiceURI);
      return [speaker.id, voice];
    }),
  );
}

export function browserSpeech(
  cue: SubtitleCue,
  settings: PlayerSettings,
  events: MediaEvents,
  voice?: SpeechSynthesisVoice,
): PlayHandle {
  if (
    !window.speechSynthesis ||
    typeof SpeechSynthesisUtterance === "undefined"
  )
    throw new Error("此浏览器不支持系统朗读，请导入音频或使用 Chrome / Edge。");
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(cue.text);
  utterance.lang = voice?.lang ?? (cue.language === "zh" ? "zh-CN" : "en-US");
  if (voice) utterance.voice = voice;
  utterance.rate = settings.rate;
  utterance.volume = settings.volume;
  utterance.onstart = events.start;
  utterance.onboundary = (event) =>
    events.time(
      event.elapsedTime,
      event.name === "word" ? event.charIndex : undefined,
    );
  utterance.onend = events.end;
  utterance.onerror = (event) =>
    events.error(
      `系统朗读失败（${event.error}）。请确认系统已安装对应语言的语音。`,
    );
  activeUtterance = utterance;
  synth.resume();
  synth.speak(utterance);
  return {
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    stop: () => {
      utterance.onstart =
        utterance.onend =
        utterance.onerror =
        utterance.onboundary =
          null;
      // A superseded handle must not cancel a newer utterance.
      if (activeUtterance === utterance) {
        activeUtterance = undefined;
        synth.cancel();
      }
    },
  };
}
let activeUtterance: SpeechSynthesisUtterance | undefined;

export class BrowserTts implements TtsProvider {
  constructor(
    private speakers: Speaker[],
    private voices: SpeechSynthesisVoice[],
  ) {}
  async play(
    cue: SubtitleCue,
    settings: PlayerSettings,
    events: MediaEvents,
    elapsed = 0,
  ) {
    if (!cue.audioAssetId) return this.speak(cue, settings, events);
    const asset = await db.assets.get(cue.audioAssetId);
    if (!asset || asset.kind !== "audio")
      throw new Error("找不到该字幕的音频资源。");
    const url = URL.createObjectURL(asset.blob);
    const audio = new Audio(url);
    audio.playbackRate = settings.rate;
    audio.volume = settings.volume;
    if (elapsed > 0) audio.currentTime = elapsed * settings.rate;
    const stop = () => {
      audio.onplaying =
        audio.ontimeupdate =
        audio.onended =
        audio.onerror =
          null;
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    audio.onplaying = events.start;
    audio.ontimeupdate = () => events.time(audio.currentTime / settings.rate);
    audio.onended = () => {
      stop();
      events.end();
    };
    audio.onerror = () => {
      stop();
      events.error("音频文件无法播放。");
    };
    void audio.play().catch((error) => {
      stop();
      events.error(String(error));
    });
    return {
      pause: () => audio.pause(),
      resume: () => {
        void audio.play().catch((error) => events.error(String(error)));
      },
      stop,
    };
  }
  private speak(
    cue: SubtitleCue,
    settings: PlayerSettings,
    events: MediaEvents,
  ) {
    const pool = assignVoices(
      this.speakers,
      settings.voices,
      this.voices,
      settings.voiceGenders,
    );
    return browserSpeech(cue, settings, events, pool.get(cue.speakerId));
  }
}
