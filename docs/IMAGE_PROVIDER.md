# 图片与对齐代理（可选开发接口）

此页面向需要自建服务的开发者。用 Codex 生成插画并导入故事 ZIP 的日常流程无需启动代理或配置密钥。参见 [Codex 制作流程](../README.md#用-codex-制作新故事)。

## 浏览器请求契约

前端按需向用户配置的 HTTP(S) 地址发出 multipart POST。字段如下。

| 字段 | 值 |
| --- | --- |
| prompt | 主提示词 |
| negativePrompt | 负面提示词 |
| model | 可为空，由代理选择 |
| aspectRatio | 16:9，能力由代理决定 |
| reference | 零个或多个同名图片文件，仅在配置支持时附带 |

响应为受支持的原始图片 MIME，最大 35 MB。代理应允许前端 Origin，并处理鉴权。浏览器不附带跨域 Cookie。模型、提示词、图片引用内容哈希和输出压缩配置进入缓存键。主动重新生成会绕过缓存，批处理重试优先复用缓存。取消会中止浏览器请求，已经提交给供应商的计算和计费取决于服务方。

## 本机 Node 代理

代理通过 `npm run proxy` 启动，仅监听回环地址，默认端口 8194。API Key 在运行本机代理的环境中配置。浏览器保持 Prompt-only 时不连接代理。调整 `STORY_ALLOWED_ORIGINS` 可指定可信前端来源，默认仅允许本机开发地址。若部署为远程服务，应在外层提供鉴权和限流。CORS 只能限制浏览器来源。默认每次请求最多四张 PNG/JPEG/WebP 参考图和 20 MB 请求体。

| 供应商 | 配置与能力 |
| --- | --- |
| OpenAI | `STORY_IMAGE_PROVIDER=openai`，`OPENAI_API_KEY`，默认 `gpt-image-2` 和 `2048x1152` WebP。可用 `OPENAI_IMAGE_MODEL`、`OPENAI_IMAGE_SIZE`、`OPENAI_IMAGE_QUALITY` 覆盖。参考图用 Images Edits。 |
| Gemini | `STORY_IMAGE_PROVIDER=gemini`，`GEMINI_API_KEY`，默认 `gemini-3.1-flash-image`，可用 `GEMINI_IMAGE_MODEL` 覆盖。使用 generateContent、参考图 inlineData、16:9 与 2K。 |
| ComfyUI | `STORY_IMAGE_PROVIDER=comfy`，`COMFY_URL`，`COMFY_WORKFLOW_FILE` 为 API 格式 JSON 路径，`COMFY_PROMPT_NODE` 指向正向文本节点，可设置 `COMFY_SEED_NODE`。模型字段留空或填 `comfy-workflow`。分辨率由工作流决定；本适配器使用文字角色描述。 |
| 兼容服务 | 由用户实现上述代理契约，应用端配置该地址。 |

启用参考图时，批量生成先尝试为最多四个相关主要角色补齐缺失的参考图，失败时使用文字设定。可以在「人物设定」上传或单独生成参考图。费用估算包含自动补齐的参考图。启用前请核对配置模型的能力和输入格式。

## 结构化对齐

本机代理支持 `POST /align`。配置 `OPENAI_API_KEY` 与 `OPENAI_ALIGNMENT_MODEL`，并为前端设置 URL。请求体是 `{ segments: [{ id, language, characterId, text }] }`，响应是 `{ groups: [{ zh: string[], en: string[], confidence: number }] }`。浏览器在验证失败、超时或服务不可用时回退到本地启发式算法。

## 官方协议参考

- [OpenAI Images](https://developers.openai.com/api/docs/guides/image-generation)
- [Gemini 图像生成](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini generateContent 响应结构](https://ai.google.dev/gemini-api/docs/migrate-to-interactions)
- [ComfyUI HTTP 路由](https://docs.comfy.org/development/comfyui-server/comms_routes)

仓库使用代理接口 Mock 测试队列、缓存、失败和续跑。需用自己的账户与工作流验证具体供应商请求。
