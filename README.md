# AI Bilingual Story Player

把 **Speaker 1–4** 格式的中英文对话做成可播放、可编辑的连续分镜。首次打开即有完整鹦鹉餐厅示例。播放器共享双语故事镜头，并在每段系统朗读或音频播放结束后切换字幕。

## 本地启动

需要 Node.js 24 和 npm。建议使用桌面 Chrome 或 Edge。

```sh
npm ci
npm run dev
```

打开 [本地播放器](http://127.0.0.1:5186)。点「播放」体验 Demo，或点「新建故事」粘贴自己的内容。首次播放需要浏览器中的用户操作。

## 输入与播放

```text
Speaker 1: 那只鹦鹉带着 phone（手机）走进餐厅。
Speaker 2: 它大喊：“我是顾客！”
Speaker 3: The parakeet walked into the restaurant with a phone.
Speaker 4: It shouted, “I'm a customer!”
```

Speaker 1 和 3 是人物 A，Speaker 2 和 4 是人物 B。每组四个编号可扩展两位人物。支持多行、重复发言和全角冒号。生成失败时可在原输入框修改格式。

- **中文**和 **English** 分别播放该语言的原文，中文保留夹带词汇及释义。
- **中英对照**可逐语义组播放，或整篇中文后播放整篇英语。
- 「设置」可为各 Speaker 换声并试听，选择字幕字体和位置，设置当前句、当前镜头、整篇或 A–B 循环，或在混合模式启用可调次数的跟读。
- 右侧对话、分镜列表及播放器进度条可以跳转。系统朗读跳到字幕起点，整篇时间是估计值。支持浏览器提供的词边界高亮。可在字幕编辑器上传实录，播放时以对应音频为准。

## 分镜、图片与代理

本地模式生成分镜、角色设定、提示词和字幕，不需要密钥。可以设置密度、风格、目标镜头时长和预算。编辑器支持分镜重排、复制、上传、缩放、调整字幕归属和人物参考图。内置 Demo 有五张 AI 插画，其他镜头标注为分镜占位。

要自动出图，可在「故事编辑器 → 分镜与图片 → 图片代理设置」填入私有代理。若使用仓库提供的本机代理，可在 PowerShell 中运行以下命令：

```powershell
$env:STORY_IMAGE_PROVIDER = 'openai'
$env:OPENAI_API_KEY = '<你的密钥>'
npm run proxy
```

代理地址为 `http://127.0.0.1:8194/image`。支持 OpenAI、Gemini、ComfyUI 和任何遵守 multipart 契约的自定义服务。OpenAI 和 Gemini 代理可传角色参考图。使用 OpenAI 结构化语义对齐时，另外配置 `OPENAI_ALIGNMENT_MODEL` 并在设置页指定 `/align` 的完整 URL。代理不可用时自动回退到本地对齐。[代理配置与接口](docs/IMAGE_PROVIDER.md)

API Key 仅由私有服务或本机进程读取。静态前端无需填写供应商密钥，公开部署默认只使用本地功能。图片与对齐代理 URL 保存在当前浏览器的独立设置中，故事包只迁移项目数据和媒体。生成费用上限按手动填写的单价估算。

## 保存与离线

故事、播放设置和进度、任务状态与二进制媒体保存在独立的 IndexedDB。项目库提供新建、重命名、复制和删除。导出的 ZIP 含 JSON、图像和已上传的真实音频。导入时会验证引用并创建独立副本。

故事包可在其他浏览器导入并使用已有图像和音频。生产构建包含应用外壳缓存，首次联网访问并完成缓存后，可在同一浏览器离线启动应用。系统 TTS 的离线可用性由设备决定，完整离线配音需随包附带音频。清除网站数据前建议导出所需项目。

## GitHub Pages

在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。推送到 `main` 时执行类型检查、ESLint、Vitest 和生产构建后部署；CI 还会运行 Playwright。产物使用相对路径，支持项目子路径刷新。目标为 [GitHub Pages 播放器](https://seki999.github.io/ai-bilingual-story-player/)。

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

## 常见故障

- **没有声音**：先确认「设置 → 人物语音」可列出中文和英语语音，并尝试试听。Windows 可在语言设置中安装相应语音包。浏览器不支持的声音可换成上传音频。
- **图片代理失败**：核对代理地址、浏览器的 CORS 允许来源、模型和密钥权限。公开 HTTPS 页面与本机 HTTP 代理的连接也受浏览器规则影响，建议本机开发时调试本机代理。
- **对齐偏差**：进入「字幕与对齐」，查看低置信度分组，将字幕移动到正确对照组和镜头。原始对话一直保留。
- **图片生成未完成**：打开原项目并使用「生成或继续」。已保存的画面可继续播放，失败原因显示在对应镜头。
- **ZIP 太大或损坏**：确认使用应用导出的故事包，压缩文件上限 250 MB，解压媒体总上限 350 MB。

## 技术文档

- [架构](docs/ARCHITECTURE.md)
- [播放引擎](docs/PLAYBACK_ENGINE.md)
- [分镜规划](docs/STORYBOARD_GENERATION.md)
- [图片与对齐代理](docs/IMAGE_PROVIDER.md)
- [故事包数据格式](docs/DATA_FORMAT.md)

源码采用 MIT 许可证。Demo 图片及生成说明见 [素材说明](public/demo/ASSETS.md)。结构和工具选型参考了 [cet4-visual-vocabulary](https://github.com/seki999/cet4-visual-vocabulary)。
