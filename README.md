# AI Bilingual Story Player

把 **Speaker 1–4** 格式的中英文对话做成可播放、可编辑的连续分镜。首次打开即有完整鹦鹉餐厅示例。播放器共享双语故事镜头，并在每段系统朗读或音频播放结束后切换字幕。

## 用 Codex 制作新故事

**把每篇故事的中英文对白贴到 Codex。插画生成和发布都在 Codex 中完成，无需申请图片 API Key。**

1. 把完整的 Speaker 1–4 中英文对白发给 Codex。可以同时提供故事名和画风。
2. Codex 规划分镜、为每个镜头生成插画，然后更新公开故事目录并推送到 GitHub。GitHub Actions 会发布新版站点。
3. 部署完成后，打开 [在线播放器](https://seki999.github.io/ai-bilingual-story-player/)，进入「项目库 → 已发布故事」，点击新故事即可播放。首次打开时播放器自动加载对白和图片。

> 请保留这篇对白的中英文原文，用 Codex 图像工具为每个分镜配图，然后把新故事发布到 AI Bilingual Story Player 的 GitHub Pages。

发布的对白和插画可被所有访问者看到。已经打开过的故事会保存到浏览器，可从「本地项目」再次访问。
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
- **中英对照**可按语义组选择先中后英或先英后中，也可整篇中文后播放整篇英语。
- 「设置」可为各 Speaker 独立选择男声、女声或具体系统声音并试听，也可调整字幕字体、字号和位置，设置当前句、当前镜头、整篇或 A–B 循环，或在混合模式启用可调次数的跟读。
- 右侧对话、分镜列表及播放器进度条可以跳转。系统朗读跳到字幕起点，整篇时间是估计值。支持浏览器提供的词边界高亮。可在字幕编辑器上传实录，播放时以对应音频为准。

## 在播放器里编辑故事

在「新建故事」粘贴对白，点击「生成分镜」，可在浏览器本地生成分镜、双语字幕、角色设定和图片提示词。它会为待配图的镜头显示占位。你可以在「故事编辑器 → 分镜与图片」选择对应镜头，点击「上传 / 替换图片」，也可以重排镜头和调整字幕对应关系。内置 Demo 有五张插画，其余镜头标注为占位。

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
- **对齐偏差**：进入「字幕与对齐」，查看低置信度分组，将字幕移动到正确对照组和镜头。原始对话一直保留。
- **镜头显示占位**：在编辑器里检查该镜头是否已经配图。可上传 Codex 生成的插画，或让 Codex 补图并更新故事包。
- **ZIP 太大或损坏**：确认文件是 Codex 按项目格式打包或由播放器导出的故事包，压缩文件上限 250 MB，解压媒体总上限 350 MB。

## 技术文档

- [架构](docs/ARCHITECTURE.md)
- [播放引擎](docs/PLAYBACK_ENGINE.md)
- [分镜规划](docs/STORYBOARD_GENERATION.md)
- [Codex 故事发布流程](docs/PUBLISHING.md)
- [可选开发接口：图片与对齐代理](docs/IMAGE_PROVIDER.md)
- [故事包数据格式](docs/DATA_FORMAT.md)

源码采用 MIT 许可证。Demo 图片及生成说明见 [素材说明](public/demo/ASSETS.md)。结构和工具选型参考了 [cet4-visual-vocabulary](https://github.com/seki999/cet4-visual-vocabulary)。
