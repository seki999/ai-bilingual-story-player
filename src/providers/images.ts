import { id } from "../core/dialogue";
import { db } from "../storage/db";
import { permitsAsset } from "../storage/archive";
import type {
  CharacterProfile,
  ImageAsset,
  ProviderConfig,
  Scene,
} from "../types";

export type ImageRequest = {
  prompt: string;
  negativePrompt: string;
  references: ImageAsset[];
};
export interface ImageProvider {
  readonly cacheNamespace: string;
  readonly version: string;
  readonly supportsReferences: boolean;
  generate(request: ImageRequest, signal: AbortSignal): Promise<Blob>;
}

export class ProxyImageProvider implements ImageProvider {
  constructor(private config: ProviderConfig) {}
  get cacheNamespace() {
    return JSON.stringify([
      this.config.endpoint,
      this.config.model,
      this.config.supportsReferences,
    ]);
  }
  get version() {
    return this.config.model || "proxy-v1";
  }
  get supportsReferences() {
    return this.config.supportsReferences;
  }
  async generate(request: ImageRequest, signal: AbortSignal) {
    const endpoint = new URL(this.config.endpoint);
    if (
      endpoint.username ||
      endpoint.password ||
      !["http:", "https:"].includes(endpoint.protocol)
    )
      throw new Error("请输入 HTTP(S) 代理地址。");
    const payload = new FormData();
    payload.set("prompt", request.prompt);
    payload.set("negativePrompt", request.negativePrompt);
    payload.set("model", this.config.model);
    payload.set("aspectRatio", "16:9");
    if (this.supportsReferences)
      for (const asset of request.references)
        payload.append("reference", asset.blob, asset.id);
    const response = await fetch(endpoint, {
      method: "POST",
      body: payload,
      signal,
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) {
      const plain = response.headers
        .get("Content-Type")
        ?.startsWith("text/plain");
      const detail = plain ? (await response.text()).trim().slice(0, 300) : "";
      throw new Error(
        `图片代理返回 HTTP ${response.status}${detail ? ` · ${detail}` : ""}`,
      );
    }
    const blob = await response.blob();
    if (!permitsAsset(blob.type, "image") || blob.size > 35 * 1024 * 1024)
      throw new Error("代理必须返回不超过 35 MB 的受支持图片。");
    return blob;
  }
}

export async function optimizeImage(blob: Blob, quality: number) {
  if (quality <= 0 || typeof createImageBitmap !== "function") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob(
        (value) => resolve(value?.type === "image/webp" ? value : blob),
        "image/webp",
        quality,
      ),
    );
  } finally {
    bitmap.close();
  }
}

async function hash(value: string | Blob) {
  const input =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : await value.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", input))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const active = new Map<string, Promise<ImageAsset>>();
export async function generateImage(
  provider: ImageProvider,
  request: ImageRequest,
  quality: number,
  signal: AbortSignal,
  force = false,
) {
  const references = provider.supportsReferences ? request.references : [];
  const referenceHashes = await Promise.all(
    references.map((asset) => hash(asset.blob)),
  );
  const key = await hash(
    JSON.stringify([
      provider.cacheNamespace,
      request.prompt,
      request.negativePrompt,
      referenceHashes,
      quality,
    ]),
  );
  signal.throwIfAborted();
  if (!force) {
    const cached = await db.assets.where("cacheKey").equals(key).first();
    if (cached?.kind === "image") return cached;
    const pending = active.get(key);
    if (pending) return await pending;
  }
  const pending = (async () => {
    const output = await provider.generate({ ...request, references }, signal);
    signal.throwIfAborted();
    const asset: ImageAsset = {
      id: id(),
      blob: await optimizeImage(output, quality),
      kind: "image",
      cacheKey: key,
    };
    signal.throwIfAborted();
    await db.assets.put(asset);
    return asset;
  })();
  if (!force) active.set(key, pending);
  try {
    return await pending;
  } finally {
    if (active.get(key) === pending) active.delete(key);
  }
}

export async function imageRequest(
  scene: Scene,
  people: CharacterProfile[],
): Promise<ImageRequest> {
  const cast = people.filter((p) => scene.characters.includes(p.id));
  const keys = cast.flatMap((p) => p.referenceAssetId ?? []).slice(0, 4);
  const references = (await db.assets.bulkGet(keys)).filter(
    (asset): asset is ImageAsset => asset?.kind === "image",
  );
  return {
    prompt: scene.imagePrompt,
    negativePrompt: scene.negativePrompt,
    references,
  };
}

export function referenceRequest(
  character: CharacterProfile,
  style: string,
): ImageRequest {
  return {
    prompt: `${style}. Character design reference, single full-body character or prop centered on a clean backdrop. ${character.name}: ${character.description}`,
    negativePrompt: "watermark, captions, unrelated people",
    references: [],
  };
}

export function missingReferences(
  characters: CharacterProfile[],
  scenes: Scene[],
) {
  const frequency = new Map<string, number>();
  for (const scene of scenes)
    for (const key of scene.characters) {
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  return characters
    .filter((person) => frequency.has(person.id))
    .sort((a, b) => frequency.get(b.id)! - frequency.get(a.id)!)
    .slice(0, 4)
    .filter((person) => !person.referenceAssetId && person.description.trim());
}
