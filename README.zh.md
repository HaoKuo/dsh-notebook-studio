# dsh-notebook-studio

[English](README.md) | **中文**

将一个 dsh 会话作为一个文献项目：导入最多 30 篇文字版 PDF，选择本次使用的文献，检索带页码的证据，通过提示词生成**报告（DOCX/PDF）**或**演示文稿（PPTX/PDF）**。成稿保存到当前会话工作区，并可在 Studio 内预览 PDF。可选联网背景，默认不搜索；原图、可编辑流程图与证据表按章节和页内容规划，AI 概念示意图是可选项。

仓库地址：<https://github.com/HaoKuo/dsh-notebook-studio> · 版本记录：`RELEASE_NOTES.md`

## 要求与安装

- DeepSeek Harness `0.1.7-rc.2`（`engines.dsh`）、Node.js 24、Python 3.12 + PyMuPDF。
- PDF 使用 PDFKit 直接排版，需要包含中文字形的 TTF 字体：本机可自动选用 Arial Unicode，其他环境设置 `STUDIO_CJK_FONT=/path/to/font.ttf`。
- 可选：需要返回 `images/generations` base64 PNG 的生图服务；联网参考使用 dsh 的 `ctx.web.search`，没有配置搜索提供方时会明确失败。

在仓库根目录执行：

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run check
dsh plugin --profile web add "$PWD"
mkdir -p "$HOME/.dsh/skills"
ln -sfn "$PWD/.agents/skills/research-studio" "$HOME/.dsh/skills/research-studio"
```

### 从 GitHub 安装

宿主通过 pnpm 安装 git 源，无需本地克隆：

```sh
dsh plugin --profile web add github:HaoKuo/dsh-notebook-studio
# 固定到某个发布版本：github:HaoKuo/dsh-notebook-studio#v0.6.1
```

PDF 解析按顺序寻找解释器：`STUDIO_PYTHON`（设置后必须可用）→ 包内 `.venv` → `PATH` 上的 `python3`／`python`；该解释器必须能 `import pymupdf`，都不满足时报错会列出每个候选项与修复方法：

```sh
python3 -m venv ~/.venv-studio && ~/.venv-studio/bin/pip install "PyMuPDF>=1.26,<2"
export STUDIO_PYTHON=~/.venv-studio/bin/python    # 启动 dsh web 前设置
```

安装或更新后重启 `dsh web`，以重新打包 Web Client。

## 使用流程

工作台从 dsh 侧栏「插件」上方的 **NotebookStudio** 打开：左侧资料库、中间正文编辑／PDF 预览、右侧创作设置，模型与 API 放在齿轮设置中。「返回对话」退出工作台但不更换会话。

1. 先选择一个 dsh 会话，再点击 **NotebookStudio**；没有会话时会提示选择或新建。换项目就在宿主侧栏选择另一个会话。
2. 在资料库中添加文献（可多选或选文件夹，非 PDF 会跳过）。每项目最多 30 篇，单篇必须非空且**严格小于 30,000,000 字节（30 MB）**，按内容哈希去重；扫描件不做 OCR。离开工作台会取消未传完的上传，已入库文献与正在运行的任务继续。
3. 在「模型设置」选择已加载的 dsh 文本模型（默认 DeepSeek Flash），或填写独立 API 的 Base URL、模型与密钥。图片模型默认关闭；启用时需兼容 `/v1/images/generations`（本机 Qwen 可留空密钥）。单张图默认等待 600 秒，可设 30–1800 秒。
4. 文献显示「已索引」后，勾选本次使用的 PDF 并填写写作目标。「加入网络搜索参考」只发送提示词关键词、不发送 PDF 正文；网络来源以 `[Wn]` 并附 URL 与时间单列，不能冒充 `[n] PDF p.x` 的论文证据。
5. 选择 **DOCX 或 PDF** 点「生成完整报告」，或选择 **PPTX 或 PDF** 点「生成完整演示」。演示先分 4 批生成 14 页有引用的大纲，再逐页带入 PDF 摘录生成结论、论述和讲者备注，最后排版。大纲是可选步骤：可先生成、编辑保存，再据此生成详细成稿。
6. 插图按正文规划：报告每节 0–2 个视觉素材，演示每页一个主要视觉区域。结果用原图、机制用流程图、比较用表格，抽象概念可用 AI 示意图；生图串行执行，失败时以该章节/页的流程图补位，不冒充论文结果。
7. 「预览成稿」查看 PDF，「导出」下载所选格式，「文件与来源」给出实际路径与来源清单。成稿保存在**当前会话工作区**的 `notebook-studio/<会话专属目录>/<report或deck-随机后缀>/`；重新排版写入新目录，不覆盖已编辑的副本。
8. 「打开正文编辑」可修改标题、摘要、段落、表格结论和逐页正文，「保存并重新排版」应用修改时不调用文本模型改写正文，也不接受修改引用 ID 或素材来源，因此改动过的结论仍需人工核对证据。
9. 同一浏览器页面内，离开后重新进入 NotebookStudio 会保留该会话的提示词、选篇和草稿；不同会话隔离，刷新会丢失未保存草稿。生成成功的内容已保存在 Host 数据库和文件中。
10. 在 Chat 中使用 `studio_search` 问答，回答应附证据 ID、文献名和 PDF 页码；左侧也可检索证据、查看任务记录并重试失败文献。

### 宿主兼容范围

插件只使用公开槽位：入口注册到 `sidebar.panellist`，工作台注册到 `main`，以 `session-maybe` 子槽读取当前会话，「返回对话」调用 `layout.selectPanel(null)`；不改宿主核心布局、不使用私有路由或模拟点击。已在 dsh `0.1.7-rc.2` 上验证 `npm run check`（41 个 JavaScript + 2 个 Python 测试）、profile 合成，以及运行中的 `dsh web` 能挂载宿主侧插件。

## 目录和安全

- `src/`：Host（RPC、上传、SQLite FTS5、模型调用、DOCX/PPTX/PDF）；`lib/client.js`：Web Client；`worker/`：PyMuPDF 解析；`tests/`：回归测试；`.agents/skills/`：检索技能。
- 内部数据库、原始 PDF、提取图和缓存保留在 `~/.dsh/studio/v1/<会话专属目录>/`，交付文件另存到会话工作区。输出路径只取自 Host 的会话 `cwd`：模型与客户端都不能指定任意路径，输出子目录的符号链接会被拒绝。上传经 dsh Connection 认证、每块 512 KiB；下载与预览按当前会话的记录 ID 校验。
- API Key 保存在权限受限的 SQLite 文件中，读取设置只返回「已配置」。文本 API 会收到**所选 PDF 摘录**，联网搜索只收到提示词关键词，启用云端图片服务后示意图提示词会发送给该服务。请先确认文献上传、原图使用与各 API 提供方的授权；图片不标记为论文实验结果。
- DOCX/PPTX 可编辑；PDF 由同一内容单独排版，不是 Office 的逐像素转换。没有原图或生图模型时仍可输出原生流程图与对照表。质量结论须经人工对照测评。

运行 `npm run check` 检查 JavaScript 与 Python；真实文献的云端生成与真实联网检索不在自动测试范围内。

## 许可证

MIT，见 [LICENSE](LICENSE)。
