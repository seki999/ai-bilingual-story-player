# 数据格式

数据库 `ai-bilingual-story-player` (Dexie v1) 有 projects、assets 和 tasks 三张表。主键为稳定的字符串 ID，媒体以 Blob 存储，图片请求哈希独立索引。浏览器选中的项目及代理 URL 使用带版本的独立 LocalStorage 键。未来数据库升级由 Dexie 迁移代码处理。

ZIP v1 包含以下条目。

| 条目 | 内容 |
| --- | --- |
| manifest.json | 格式标识 ai-bilingual-story-player、版本、媒体 ID、MIME 和路径 |
| project.json | 原文、Speaker、发言、语义段、对齐组、设置和进度 |
| scenes.json | 镜头顺序、画面说明、提示词、角色和资源版本 |
| subtitles.json | 每语言字幕、对齐组、场景、逻辑时间及音频引用 |
| characters.json | 人物和重要道具，含参考图引用 |
| images/ | 原始或转换后的图片资源 |
| audio/ | 已导入的真实音频文件 |

导入建立新项目，重新分配项目及媒体 ID 并更新引用。媒体资源和项目在同一事务中保存。浏览器系统语音的音频由平台持有，故事包只保存语音选择。代理配置、API Key 与对象 URL 不属于故事包。
