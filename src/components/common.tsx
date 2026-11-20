import { Clapperboard, Image as ImageIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import type { Scene } from "../types";

export function IconButton({
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    />
  );
}

export function formatTime(seconds: number) {
  const time = Math.max(0, Math.floor(seconds));
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
}

export function SceneArt({
  scene,
  url,
  small = false,
}: {
  scene?: Scene;
  url?: string;
  small?: boolean;
}) {
  const source = url;
  if (source)
    return (
      <div
        key={source}
        className="image-fill"
        style={{ transform: `scale(${scene?.zoom ?? 1})` }}
      >
        <img
          src={source}
          alt={scene?.descriptionZh || scene?.descriptionEn || "故事镜头"}
          loading={small ? "lazy" : "eager"}
          style={{ objectPosition: scene?.position ?? "center" }}
        />
        {scene?.generationProvider === "demo-art" && !small && (
          <span className="art-tag">Demo 插画</span>
        )}
      </div>
    );
  return (
    <div
      key={scene?.sceneId}
      className={`placeholder palette-${(scene?.sceneOrder ?? 0) % 4}`}
    >
      {small ? (
        <ImageIcon size={18} />
      ) : (
        <div className="placeholder-copy">
          <Clapperboard size={39} strokeWidth={1.4} />
          <span>分镜占位</span>
          <strong>{scene?.cameraShot || "故事画面"}</strong>
          <p>
            {scene?.descriptionZh ||
              scene?.descriptionEn ||
              "生成图片或上传自己的画面"}
          </p>
        </div>
      )}
    </div>
  );
}
