import { id } from "../core/dialogue";
import type { AlignmentGroup, SemanticSegment, Speaker } from "../types";

export interface AlignmentProvider {
  align(
    segments: SemanticSegment[],
    speakers: Speaker[],
  ): Promise<AlignmentGroup[]>;
}

export class ProxyAlignmentProvider implements AlignmentProvider {
  constructor(private endpoint: string) {}
  async align(segments: SemanticSegment[], speakers: Speaker[]) {
    const people = new Map(speakers.map((s) => [s.id, s.characterId]));
    const url = new URL(this.endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("请输入有效的 HTTP(S) 对齐代理地址。");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segments: segments.map((s) => ({
          id: s.id,
          language: s.language,
          text: s.text,
          characterId: people.get(s.speakerId),
        })),
      }),
      signal: AbortSignal.timeout(90_000),
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) throw new Error(`对齐代理返回 HTTP ${response.status}`);
    return validateAlignment(await response.json(), segments, people);
  }
}

export function validateAlignment(
  input: unknown,
  segments: SemanticSegment[],
  people: Map<string, string>,
): AlignmentGroup[] {
  if (
    !input ||
    typeof input !== "object" ||
    !("groups" in input) ||
    !Array.isArray(input.groups) ||
    input.groups.length > segments.length
  )
    throw new Error("对齐结果缺少有效分组。");
  const expected = {
    zh: segments.filter((s) => s.language === "zh"),
    en: segments.filter((s) => s.language === "en"),
  };
  const index = { zh: 0, en: 0 };
  const groups = input.groups.map((row) => {
    if (
      !row ||
      !Array.isArray(row.zh) ||
      !Array.isArray(row.en) ||
      (!row.zh.length && !row.en.length) ||
      typeof row.confidence !== "number" ||
      !Number.isFinite(row.confidence) ||
      row.confidence < 0 ||
      row.confidence > 1
    )
      throw new Error("对齐分组格式无效。");
    const cast = new Set<string | undefined>();
    for (const lang of ["zh", "en"] as const)
      for (const key of row[lang]) {
        const segment = expected[lang][index[lang]++];
        if (!segment || segment.id !== key)
          throw new Error("对齐结果包含错序、重复或未知的字幕。");
        cast.add(people.get(segment.speakerId));
      }
    if (row.zh.length && row.en.length && cast.size !== 1)
      throw new Error("对齐结果关联了不同人物。");
    return {
      id: id(),
      zh: row.zh as string[],
      en: row.en as string[],
      confidence: row.zh.length && row.en.length ? row.confidence : 0,
    };
  });
  if (index.zh !== expected.zh.length || index.en !== expected.en.length)
    throw new Error("对齐结果漏掉了原始字幕。");
  return groups;
}
