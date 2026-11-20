import type {
  AlignmentGroup,
  DialogueTurn,
  SemanticSegment,
  Speaker,
} from "../types";

export const id = () => crypto.randomUUID();
const marker = /^\s*Speaker\s*(\d+)\s*[:：]\s*(.*)$/i;

export function parseDialogue(source: string) {
  const speakers = new Map<string, Speaker>();
  const turns: DialogueTurn[] = [];
  for (const [index, line] of source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .entries()) {
    const match = marker.exec(line);
    if (match) {
      const n = Number(match[1]);
      if (!Number.isSafeInteger(n) || n < 1)
        throw new Error(`第 ${index + 1} 行的 Speaker 编号无效。`);
      const speakerId = `speaker-${n}`;
      const role = (n - 1) % 2;
      speakers.set(speakerId, {
        id: speakerId,
        name: `Speaker ${n}`,
        language: (n - 1) % 4 < 2 ? "zh" : "en",
        characterId: `character-${Math.floor((n - 1) / 4) * 2 + role + 1}`,
      });
      turns.push({ id: id(), speakerId, text: match[2] });
    } else if (/^\s*Speaker\b/i.test(line)) {
      throw new Error(`第 ${index + 1} 行的格式有误，请使用 Speaker 1: 对话。`);
    } else if (turns.length) {
      turns[turns.length - 1].text += "\n" + line;
    } else if (line.trim()) {
      throw new Error(`第 ${index + 1} 行缺少 Speaker 标签。`);
    }
  }
  if (!turns.length) throw new Error("请粘贴至少一段 Speaker 对话。");
  for (const turn of turns) {
    turn.text = turn.text.trim();
    if (!turn.text)
      throw new Error(`${speakers.get(turn.speakerId)?.name} 的发言为空。`);
  }
  const segments: SemanticSegment[] = turns.flatMap((turn) => {
    const language = speakers.get(turn.speakerId)!.language;
    return splitText(turn.text, language).map((text) => ({
      id: id(),
      turnId: turn.id,
      speakerId: turn.speakerId,
      language,
      text,
    }));
  });
  return { speakers: [...speakers.values()], turns, segments };
}

export function splitText(text: string, language: "zh" | "en") {
  const limit = language === "zh" ? 42 : 102;
  const chunks: string[] = [];
  let current = "";
  let depth = 0;
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    current += char;
    if ("(（".includes(char)) depth++;
    if (")）".includes(char)) depth = Math.max(0, depth - 1);
    if (depth) continue;
    const next = text[i + 1] ?? "";
    if ('”’"』」'.includes(next) && next) continue;
    if (
      /[。！？!?\n。]/.test(char) ||
      (char === "." && !/\d/.test(next) && (!next || /\s/.test(next)))
    )
      flush();
    else if (
      /[，,；;：:]/.test(char) &&
      current.trim().length >= (language === "zh" ? 7 : 17)
    )
      flush();
    else if (
      current.length >= limit &&
      (language === "zh"
        ? !/[a-zA-Z0-9（(]/.test(next) && !/[。！？，、]/.test(next)
        : /\s/.test(char))
    )
      flush();
    else if (
      current.length >= limit * 1.6 &&
      (language === "zh" || !/[a-zA-Z]/.test(next))
    )
      flush();
  }
  flush();
  // Split compound actions at meaningful conjunctions, preserving every word.
  const clause =
    language === "zh"
      ? /(?=上传到|发布到|并且|然后|随后|接着|转身|立刻|突然)/u
      : /(?=\bwho (?:brought|took|saw|found|entered)\b|\band (?:posted|uploaded|ran|opened|shouted|grabbed|turned)\b|\bthen\b)/i;
  return chunks.flatMap((chunk) => {
    const parts: string[] = [];
    let pending = "";
    let depth = 0;
    for (const part of chunk.split(clause)) {
      if (depth === 0 && pending) {
        parts.push(pending.trim());
        pending = "";
      }
      pending += part;
      for (const char of part) {
        if ("(（".includes(char)) depth++;
        if (")）".includes(char)) depth = Math.max(0, depth - 1);
      }
    }
    if (pending) parts.push(pending.trim());
    return parts.length > 1 &&
      parts.every((part) => part.length >= (language === "zh" ? 5 : 12))
      ? parts
      : [chunk];
  });
}

const concepts: [RegExp, RegExp][] = [
  [/听说/, /hear/],
  [/网红|博主/, /influencer|blogger/],
  [/鹦鹉/, /parakeet|parrot/],
  [/餐厅|餐馆/, /restaurant/],
  [/带进|进入/, /brought|entered|into/],
  [/拍摄|拍了|录像|视频/, /record|film|video/],
  [/上传|发布|社交媒体/, /posted|upload|social media/],
  [/供应|限量|刺身/, /serving|limited.edition|sashimi/],
  [/第一反应|想法/, /first thought/],
  [/会说话/, /can talk|talking/],
  [/笑|哈哈/, /laugh|hahaha/],
  [/荒唐|玩笑/, /ridiculous|joke/],
  [/行为|争议/, /behavior|controversy/],
  [/如果我是/, /if i were/],
  [/大喊|叫喊/, /scream|shout/],
  [/服务员/, /waiter/],
  [/报警|警察/, /police/],
  [/晚餐/, /dinner/],
  [/顾客|客人/, /customer|guest/],
  [/开门|关门/, /open.*door|clos.*door/],
  [/跑|奔/, /run|ran|rush/],
  [/狗/, /dog/],
  [/猫/, /cat/],
  [/谢谢/, /thank/],
  [/你好/, /hello|\bhi\b/],
  [/咖啡/, /coffee/],
  [/手机/, /phone/],
  [/抱歉|对不起/, /sorry/],
  [/吃/, /eat/],
  [/学校/, /school/],
];
function tokens(text: string, side: 0 | 1) {
  const lower = text.toLowerCase();
  return new Set([
    ...concepts.flatMap((pair, i) =>
      pair[side].test(lower) ? [`concept-${i}`] : [],
    ),
    ...(lower.match(/[a-z]+|\d+/g) ?? []).filter(
      (word) => word.length > 2 || /\d/.test(word),
    ),
  ]);
}

function similarity(zh: SemanticSegment[], en: SemanticSegment[]) {
  const a = zh.map((s) => s.text).join(" ");
  const b = en.map((s) => s.text).join(" ");
  const left = tokens(a, 0);
  const right = tokens(b, 1);
  const overlap = [...left].filter((term) => right.has(term)).length;
  const han = (a.match(/\p{Script=Han}/gu) ?? []).length;
  const words = b.trim().split(/\s+/).length;
  const ratio =
    (han * 0.66 + (a.match(/[a-z]+/gi) ?? []).length * 0.5 + 1) / (words + 1);
  const unrelated = (
    side: SemanticSegment[],
    language: 0 | 1,
    other: Set<string>,
  ) =>
    side.length <= 1
      ? 0
      : side.filter((segment) => {
          const evidence = [...tokens(segment.text, language)].filter((term) =>
            term.startsWith("concept-"),
          );
          return (
            evidence.length > 0 && evidence.every((term) => !other.has(term))
          );
        }).length;
  const stray = unrelated(zh, 0, right) + unrelated(en, 1, left);
  return (
    Math.min(1, overlap * 0.27) +
    0.34 * Math.exp(-Math.abs(Math.log(ratio))) -
    0.14 * (zh.length + en.length - 2) -
    0.24 * stray
  );
}

// Monotonic alignment with bounded many-to-many candidates and explicit gaps.
export function alignSegments(
  segments: SemanticSegment[],
  speakers: Speaker[],
): AlignmentGroup[] {
  const zh = segments.filter((s) => s.language === "zh");
  const en = segments.filter((s) => s.language === "en");
  const people = new Map(speakers.map((s) => [s.id, s.characterId]));
  const width = en.length + 1;
  const score = new Float64Array((zh.length + 1) * width).fill(-Infinity);
  const step = new Uint8Array(score.length);
  score[0] = 0;
  const counts = [
    [1, 1],
    [1, 2],
    [2, 1],
    [1, 3],
    [3, 1],
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i <= zh.length; i++)
    for (let j = 0; j <= en.length; j++) {
      const here = i * width + j;
      if (!Number.isFinite(score[here])) continue;
      for (const [choice, [x, y]] of counts.entries()) {
        if (i + x > zh.length || j + y > en.length) continue;
        const left = zh.slice(i, i + x);
        const right = en.slice(j, j + y);
        if (
          x &&
          y &&
          new Set([...left, ...right].map((s) => people.get(s.speakerId)))
            .size !== 1
        )
          continue;
        const next = (i + x) * width + j + y;
        const value =
          score[here] + (x && y ? similarity(left, right) - 0.4 : -0.19);
        if (value > score[next]) {
          score[next] = value;
          step[next] = choice + 1;
        }
      }
    }
  const groups: AlignmentGroup[] = [];
  let i = zh.length;
  let j = en.length;
  while (i || j) {
    const [x, y] = counts[step[i * width + j] - 1];
    const left = zh.slice(i - x, i);
    const right = en.slice(j - y, j);
    groups.push({
      id: id(),
      zh: left.map((s) => s.id),
      en: right.map((s) => s.id),
      confidence:
        x && y ? Math.max(0.1, Math.min(1, similarity(left, right))) : 0,
    });
    i -= x;
    j -= y;
  }
  return groups.reverse();
}
