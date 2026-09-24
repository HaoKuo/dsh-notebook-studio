# dsh Notebook Studio Release Notes

**English** | Chinese is folded under each version below — click **中文** to expand.

## v0.6.0 · 2026-09-25 (local development version, not yet released / 本地开发版本，尚未发布)

- The plugin now follows the dsh language setting (`zh`/`en`). The Host serves one catalog through a new `getMessages` RPC (session-independent), built from `src/messages.js` + `src/messages.en.json`; keys are the Chinese source strings, so an untranslated entry falls back to the source text instead of an empty label. The Web client reads the active locale from the host locale service, installs the catalog once at load and re-renders an open workbench after a language switch; without the locale service it falls back to the browser language.
- Static labels are translated where they render (a thin wrapper around the element factory, plus `placeholder`/`title`/`aria-label`), and assembled sentences such as `已选 3/3 篇` match catalog templates like `已选 {selected}/{total} 篇`; text with no catalog entry stays Chinese. Model-facing `studio_search` text (tool description, parameter description, guidance and errors) follows an explicitly selected non-Chinese preference, otherwise it stays in the source language.
- The subtitle under the title now shows the **current workspace** (`工作区 · <folder>`, full session workspace path in the tooltip): the project snapshot gained `workspacePath`/`workspaceName`, so a session folder name such as `test1` is no longer mislabelled as a project. The plugin still has no workspace-folder picker — the workspace is the dsh session workspace chosen by the host, and deliverables are written under `notebook-studio/<session>/…` inside it.
- `npm run check`: **40 JavaScript + 2 Python tests pass**, including a new regression that a `locale`-driven English render produces English labels while strings missing from the catalog keep the Chinese source.

<details>
<summary>中文</summary>

- 插件现在跟随 dsh 的语言设置（`zh`/`en`）。宿主通过新增的 `getMessages` RPC（与会话无关）下发一份词典，来自 `src/messages.js` + `src/messages.en.json`；词典键是中文原文，未收录的条目会回退到中文原文而不是空标签。Web Client 从宿主 locale 服务读取当前语言，加载时安装词典，切换语言后重新渲染已打开的工作台；没有 locale 服务时退回浏览器语言。
- 静态文案在渲染处翻译（元素工厂外挂一层轻量包装，并处理 `placeholder`／`title`／`aria-label`）；`已选 3/3 篇` 这类拼接句子按 `已选 {selected}/{total} 篇` 这样的词典模板匹配；没有对应条目的文案保持中文。面向模型的 `studio_search` 文案（工具描述、参数说明、返回指引与错误）跟随用户显式选择的非中文语言，否则保持原文。
- 标题下的副标题改为显示**当前工作区**（`工作区 · <文件夹>`，悬停显示完整会话工作区路径）：项目快照新增 `workspacePath`／`workspaceName`，因此 `test1` 这种会话文件夹名不再被当成项目名。插件仍**没有**工作区文件夹选择器——工作区由宿主的会话工作区决定，成稿仍写在该工作区下的 `notebook-studio/<会话>/…`。
- `npm run check`：**40 个 JavaScript + 2 个 Python 测试通过**，新增回归覆盖「locale 驱动的英文渲染输出英文标签，而词典未收录的文案保持中文原文」。

</details>

## v0.5.3 · 2026-09-25 (local fix, not yet released / 本地修复，尚未发布)

- Fixed the version label under the sidebar: it was hardcoded as `Notebook Studio · v0.5.0` and had drifted from `package.json`. The host now reads its own `package.json` version and sends it as `version` in the project snapshot, and the client renders `Notebook Studio · v<version>` (falling back to no version when absent), so the label follows the installed package again.
- Task records now show what actually happened. Each row renders the task type (`导入文献`, `生成大纲`, `生成报告`, `生成演示`, `重新排版`, `重试解析`), the local start time (`MM/DD HH:mm`), the state, the last phase when it differs from the state, and the duration of finished jobs; the summary shows the row count. Previously the row printed `phase` plus the state label, so a finished job showed two lines that both read "完成". The type and both timestamps were already stored in SQLite (`jobs.kind`, `created_at`, `updated_at`) — only the rendering was missing them.
- The project label under the title is now prefixed with `项目 · ` and its tooltip carries the full session workspace path (new `projectPath` field), so a bare folder name such as `test1` — the fallback used when a session has no title — is no longer ambiguous.

<details>
<summary>中文</summary>

- 修复侧栏下方的版本号：原先是硬编码 `Notebook Studio · v0.5.0`，与 `package.json` 脱节。现在宿主读取自身 `package.json` 的版本，作为 `version` 放进项目快照，客户端渲染 `Notebook Studio · v<版本>`（缺失时不显示），版本号重新跟随已安装的包。
- 任务记录改为显示真实信息：每行渲染任务类型（`导入文献`／`生成大纲`／`生成报告`／`生成演示`／`重新排版`／`重试解析`）、本地开始时间（`MM/DD HH:mm`）、状态、与状态不同的最后阶段，以及已完成任务的耗时；摘要显示条数。此前该行只打印 `phase` 和状态文案，于是完成任务显示成两行都叫「完成」。类型与两个时间戳其实一直存在 SQLite（`jobs.kind`、`created_at`、`updated_at`），只是渲染时没有使用。
- 标题下的项目名加上 `项目 · ` 前缀，并把完整会话工作区路径放进提示（新增 `projectPath` 字段），因此像 `test1` 这种「会话无标题时回退到工作区文件夹名」的情况不再有歧义。

</details>

## v0.5.2 · 2026-09-25 (local development version, not yet released / 本地开发版本，尚未发布)

- Host dependency pins moved from `0.1.6-alpha.2` to **`0.1.7-rc.2`** for `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-tools`, with a fresh `npm install` so the whole tree (`@deepseek-ai/dsh-agent` included) resolves at `0.1.7-rc.2`; the exports the plugin actually uses (`BlockAssembler`, `createUserMessage`, `defineTool`) are unchanged or a superset between the two versions.
- Declared `jszip@3.10.2` as a devDependency: three test files import it and it was previously resolved only by hoisting from `docx`/`pptxgenjs`.
- Documentation is now bilingual: `README.md` is the English default with a switch to `README.zh.md`, and this file keeps English visible with the Chinese folded under each version. Both "host compatibility" sections now name `0.1.7-rc.2` as the baseline and record the acceptance below.
- Acceptance in dsh `0.1.7-rc.2`: `npm run check` passes **39 JavaScript + 2 Python tests** against the new pins, `dsh --profile web --dump-config` composes the plugin layer into the web profile, and the running `dsh web` (0.1.7-rc.2) mounts the host side with `studio_search` answering. Not covered: a full cloud generation with real papers under 0.1.7-rc.2, and deployment acceptance in a restarted instance carrying the new dependency tree.
- Environment fix found during acceptance: the `web` profile listed the superseded bundle `@deepseek-ai/dsh-experimental-agent-team-web-profile`, which 0.1.7-rc.2 no longer ships (its UI layer now lives in `@deepseek-ai/dsh-experimental-agent-team-profile`); the stale entry was removed so the profile composes without warnings.

<details>
<summary>中文</summary>

- 宿主依赖 `@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-tools` 从 `0.1.6-alpha.2` 提到 **`0.1.7-rc.2`**，并做全新 `npm install`，使整棵树（含 `@deepseek-ai/dsh-agent`）都解析到 `0.1.7-rc.2`；插件实际用到的导出（`BlockAssembler`、`createUserMessage`、`defineTool`）在两版之间未变或为超集。
- 声明 `jszip@3.10.2` 为 devDependency：三个测试文件 import 它，此前只靠 `docx`/`pptxgenjs` 的 hoist 才能解析。
- 文档改为中英双语：`README.md` 为英文默认并可切换到 `README.zh.md`，本文件保持英文正文、各版本中文折叠。「宿主兼容范围」两处已改为以 `0.1.7-rc.2` 为基准，并记录下述验收结果。
- 在 dsh `0.1.7-rc.2` 上的验收：`npm run check` 针对新 pin 通过 **39 个 JavaScript + 2 个 Python 测试**；`dsh --profile web --dump-config` 能把插件层合成进 web profile；运行中的 `dsh web`（0.1.7-rc.2）已挂载宿主侧，`studio_search` 可正常应答。未覆盖：在 0.1.7-rc.2 上用真实文献做完整云端生成，以及携带新依赖树的重启实例中的部署验收。
- 验收期间发现的环境问题：`web` profile 曾列出已被取代的 bundle `@deepseek-ai/dsh-experimental-agent-team-web-profile`，0.1.7-rc.2 不再提供（其 UI 层已并入 `@deepseek-ai/dsh-experimental-agent-team-profile`）；已删除该过期条目，profile 合成不再报警告。

</details>

## v0.5.1 · 2026-09-24 (local development version, not yet released / 本地开发版本，尚未发布)

- The entry is unified into **NotebookStudio** above "Plugins" on the left of dsh; the session tab and the session-top Studio button are removed. It uses the host's public `sidebar.panellist`/`main` slots, keeps the host navigation, and no longer carries the workbench in a full-screen dialog.
- The main panel binds the current session through the `session-maybe` sub-slot; with no session it prompts you to select or create one instead of guessing a project or sending paper RPCs. "Back to chat" only leaves the panel and does not change the current session; re-entering after leaving keeps the session draft held on this page.
- The standalone teal palette is removed: background, text, buttons, selection, focus, borders, error/success messages and the settings overlay all use host theme variables. Sidebar row styling, selection state and collapse hints are drawn by dsh; light and dark themes follow live. The PDF document canvas stays white paper and does not invert the body.
- `npm run check`: **39 JavaScript + 2 Python tests pass**, with new regressions for the single entry, main panel/session scoping, no-session behaviour, exit and resource cleanup, and theme variables.
- Using the existing Playwright/Chrome isolated test harness, it loads dsh's real React, navigation row component and theme CSS to verify 1440×1000 / 390×844, entry order and selection state, no RPC without a session, session isolation and draft restore, and light/dark themes, plus body save/failed retry, preview, download error interception, upload, search and settings. This is not full real-host deployment acceptance; dsh was not restarted and no real cloud model was called.

<details>
<summary>中文</summary>

- 入口统一为 dsh 左侧「插件」上方的 **NotebookStudio**，取消会话标签与会话顶部 Studio 按钮。使用宿主 `sidebar.panellist`／`main` 公开槽位，保留宿主导航，不再用全屏对话框承载工作台。
- 主面板通过 `session-maybe` 子槽绑定当前会话；无会话时提示先选择或新建，不猜测项目或发送文献 RPC。「返回对话」只退出面板，不改变当前会话；离开后重进保留本页内的会话草稿。
- 移除独立青绿色，背景、文字、按钮、选中态、焦点、边框、错误／成功提示和设置遮罩全部使用宿主主题变量。侧栏行的样式、选中态和折叠提示由 dsh 绘制；明暗主题实时跟随。PDF 文档画布保持白纸，不对正文反色。
- `npm run check`：**39 个 JavaScript + 2 个 Python 测试通过**，新增唯一入口、主面板／会话作用域、无会话行为、退出和资源清理及主题变量回归。
- 使用现有 Playwright/Chrome 隔离测试壳，加载 dsh 实际 React、导航行组件和主题 CSS，验证 1440×1000／390×844、入口顺序与选中态、无会话无 RPC、会话隔离与草稿恢复、亮暗主题，以及正文保存／失败重试、预览、下载错误拦截、上传、检索与设置。非完整真实宿主部署验收；未重启 dsh，未调用真实云端模型。

</details>

## v0.5.0 · 2026-09-24 (local development version, not yet released / 本地开发版本，尚未发布)

- Reworked into a centralized three-column workbench: the Studio entry at the top of the session opens a full-width interface and keeps the session tab; uploads and paper selection on the left, body/preview/optional outline in the middle, prompt and format on the right. Both sides collapse and narrow screens stack vertically; models/APIs moved into the gear settings so they no longer occupy the main workspace. Native dialogs support Esc to close and return focus, without relying on private host navigation.
- Added body editing and re-export: report summaries, paragraphs and table conclusions; deck per-page titles, discussion, key conclusions and notes. Saving does not call a text model to rewrite, keeps citations and asset sources, and rejects stale versions. New exports are saved separately and never overwrite the old document; unsaved bodies cannot be exported directly, avoiding an accidental download of stale content. Edited semantics still need manual evidence checking.
- Added `getDocument`/`saveDocument` RPCs; deck source list v3 stores the complete document data and can still restore from a v2 list, never passing the current outline off as an old document. Titles, array structure and text lengths are validated server-side, and the client cannot change citations, paper selection or asset fields.
- Both entries share session-level prompts, paper selection and edited drafts within one browser page; different sessions are isolated and the API key is never put into the shared cache. Unsaved content is warned about before a refresh; a typesetting failure keeps the draft for retry. Drafts are not persisted across restarts, and closing the workbench cancels unfinished uploads without stopping background generation.
- `npm run check`: **36 JavaScript + 2 Python tests pass**, adding coverage for edited PPTX/DOCX XML, real Chinese PDF body text, no overwrite of old documents, stale and cross-session rejection, no extra text-model call count, and old source-list restore.
- With no Browser plugin available, the existing Playwright/Chrome harness and the real dsh React runtime are used to verify the entry and return at 1440×1000 / 390×844, dual-entry drafts, session isolation, edit save and failed retry, outline, model settings, search, upload and 31-paper rejection, both PDF previews, full downloads and empty-response/HTTP 400 interception; no application exceptions and no horizontal overflow, only the deliberately triggered HTTP 400 network log.
- Dependency and slot contracts are still baselined on this machine's **dsh 0.1.6-alpha.2**; **0.1.7-rc.2 has not been accepted**, so compatibility with the newest version is not claimed. The user's dsh was not restarted, stopped or upgraded; the current service must be restarted by the user to load the new version. No real papers were sent to the cloud, and this does not replace acceptance on real Safari, PowerPoint and a host deployment.

<details>
<summary>中文</summary>

- 改为集中式三栏工作台：会话顶部 Studio 入口打开全宽界面，保留会话标签；左侧上传和选篇，中间正文／预览／可选大纲，右侧提示词与格式。两侧可折叠，窄屏纵向显示；模型/API 放到齿轮设置，不占主工作区。原生对话框支持 Esc 关闭及焦点归还，不依赖私有宿主导航。
- 新增正文编辑与重新导出：报告摘要、段落和表格结论；演示逐页标题、论述、核心结论和备注。保存时不调用文本模型重写，保留引用和素材来源，拒绝过期版本。新导出另存，不覆盖旧稿；未保存正文禁止直接导出，以免误下载旧内容。编辑后的语义仍需人工核对证据。
- 新增 `getDocument`／`saveDocument` RPC；PPT 来源清单 v3 保存完整成稿数据，兼容从 v2 清单还原，绝不以当前大纲冒充旧成稿。标题、数组结构和文字长度经服务端校验，客户端不能改变引用、选篇或素材字段。
- 两入口在同一浏览器页面共享会话级提示词、选篇和编辑草稿；不同会话隔离，不把 API Key 放入共享缓存。刷新前提示未保存内容；排版失败保留草稿供重试。草稿不是跨重启持久化，关闭工作台会取消未传完的上传，但不停止后台生成。
- `npm run check`：**36 个 JavaScript + 2 个 Python 测试通过**，新增覆盖编辑后的 PPTX/DOCX XML、中文 PDF 实际正文、旧稿不覆盖、过期及跨会话拒绝、文本模型调用计数不增加、旧来源清单恢复。
- 无 Browser 插件可用，使用现有 Playwright/Chrome 和实际 dsh React 运行时的隔离测试壳，验证 1440×1000／390×844 的入口与返回、双入口草稿、会话隔离、编辑保存及失败重试、大纲、模型设置、检索、上传与 31 篇拒绝、两类 PDF 预览、完整下载及空响应／HTTP 400 拦截；无应用异常与横向溢出，仅故意触发的 HTTP 400 网络日志。
- 依赖与槽位契约仍以本机 **dsh 0.1.6-alpha.2** 为基准；**0.1.7-rc.2 未验收**，不宣称兼容最新版本。未重启、停止或升级用户 dsh；当前服务须由用户自行重启后加载新版。未发送真实文献到云端，未替代真实 Safari、PowerPoint 和宿主部署验收。

</details>

## v0.4.1 · 2026-09-24 (local fix, not yet released / 本地修复，尚未发布)

- Fixed the root cause of PPTX/DOCX/PDF/source-list downloads being 0 bytes and of blank Studio previews: all download routes now set `requestBody: 'buffered'` explicitly, so dsh no longer builds a request body for a GET and returns an empty HTTP 400. HEAD, empty-document rejection and client-side download status/length checks were added.
- The UI was tidied into four entries — "Studio, Library, Documents, Model settings". The studio shows only the current report/deck type's prompt, format and main actions; the outline folds per page, papers support select-all/clear, historical tasks fold by default, previews and downloads are gathered together, and a completed-but-illustration-degraded task shows a prominent standalone notice.
- The default image wait time was raised from 180 to 600 seconds, adjustable to 30–1800 seconds in settings, with separate messages for connection failure, timeout and user cancellation. The local Qwen endpoint returned a valid 1024×1024 PNG in about 160 seconds with a non-sensitive test prompt; cloud generation for the user's papers was not re-run.
- Added HTTP-level regressions checking request-body declarations, full GET bytes, HEAD, inline preview and empty-file rejection on all six download routes; browser tests cover the four panels, 30-paper selection, both authoring modes, preview/close, download completeness and not saving empty files on an empty response/HTTP 400.
- `npm run check`: **34 JavaScript + 2 Python tests pass**. The Playwright/Chrome isolated harness verifies panel interaction and download/preview at 1440×1000 and 390×844 with no application exceptions; the deliberately simulated HTTP 400 produces only the expected network error. Per the user's request the running dsh was not restarted, so the real deployment path must be verified after the user restarts it.
- This server-side manuscript has 15 pages and was confirmed non-empty with an Office-compatible renderer; the 0-byte PPTX and JSON in the original download directory were restored byte-for-byte from the complete server copy. The fix does not rewrite existing document content; deck layout and Chinese rendering under different font environments still depend on the actual PowerPoint.

<details>
<summary>中文</summary>

- 修复 PPTX/DOCX/PDF/来源清单下载为 0 字节及 Studio 预览空白的根因：全部下载路由显式设置 `requestBody: 'buffered'`，避免 dsh 对 GET 错误构造请求体并返回空的 HTTP 400。增加 HEAD、空成稿拒绝及客户端下载状态/长度检查。
- 界面整理为「创作台、资料库、成稿、模型设置」四个入口。创作台只显示当前报告/演示类型的提示词、格式与主操作；大纲按页折叠，文献支持全选/清空，历史任务默认折叠，预览和下载集中展示；完成但插图降级使用醒目的独立提示。
- 生图默认等待时间从 180 秒提高到 600 秒，设置中可调 30–1800 秒；分别提示连接失败、超时及用户取消。本机 Qwen 使用无敏感信息的测试提示词实测返回有效 1024×1024 PNG，用时约 160 秒；未重跑用户文献的云端生成。
- 新增 HTTP 级回归，检查六种下载路由的请求体声明、GET 完整字节、HEAD、inline 预览及空文件拒绝；浏览器测试覆盖四分区、30 篇选择、两种创作模式、预览/关闭、下载完整性及空响应/HTTP 400 不保存空文件。
- `npm run check`：**34 个 JavaScript + 2 个 Python 测试通过**。Playwright/Chrome 隔离测试壳在 1440×1000 和 390×844 验证分区交互及下载/预览，无应用异常；故意模拟 HTTP 400 时仅出现对应预期网络错误。按用户要求未重启运行中的 dsh，真实部署链路须在用户重启后验证。
- 用户这份服务器原稿含 15 页，已用 Office 兼容渲染器确认非空；原下载目录的 0 字节 PPTX 与 JSON 已从服务器完整副本恢复并逐字节核对。修复不改写原有成稿内容；PPTX 在不同字体环境下的版式和中文显示仍应以实际 PowerPoint 为准。

</details>

## v0.4.0 · 2026-09-24 (local development version, not yet released / 本地开发版本，尚未发布)

- Documents are saved automatically into `notebook-studio/<session-specific directory>/` in the current dsh session workspace, keeping Office, PDF and the source list together; older documents are back-filled automatically, repeated reads do not duplicate exports, and re-typesetting saves to a new directory. A workspace save failure is reported explicitly and does not affect internal document download; output subdirectories must not contain symlinks.
- Studio gained embedded PDF preview for reports and decks, opening in a new window, and the actual save path. PDF preview still uses the original session authentication and accepts no arbitrary file path; DOCX/PPTX remain separately downloadable and editable.
- Fixed the misleading "page 6 key conclusion does not cite the current PDF excerpt" check: over-long text, missing citations and excessive citations are now distinguished, model retries carry the concrete error and the previous JSON, and available numbers are offered when a citation is omitted. Genuinely unsupported content is still refused rather than bypassed with fabricated citations.
- Reports plan original figures, flowcharts, tables or optional generated images per section, and decks per page, replacing the fixed whole-document image count and fixed figure page positions; the same original figure is not reused repeatedly, generation prompts include the section/page body, and a failure is filled with that section/page's flowchart plus a notice. New-version caches are isolated from the old fixed-illustration version; older reports must be regenerated to get the new model visual plan.
- Captions state their relation to the body, the source list keeps section/page, evidence, original figure page and original caption, and generated images are marked as not experimental results. Report PDFs reserve space based on actual caption length, while deck captions are truncated for display with the full text kept in notes and the source list.
- `npm run check`: **32 JavaScript + 2 Python tests pass**. Synthetic reports verify 4 sections and 7 visuals (2 original figures, 3 generated images, 1 flowchart, 1 table) and check section order and long-caption pagination. An isolated UI harness using the real dsh React and this version's client verifies report preview → close → deck preview at 1440×1000 and 390×844 with no console errors or horizontal overflow; this is not end-to-end acceptance of a running dsh.
- The plugin symlink already points at this repository, and the running `dsh web` was **not restarted automatically**; a restart loads the new Host/Web Client. No real papers were handed to a cloud model again and no existing user report was regenerated; existing reports are only back-filled into the workspace. Real generated content and illustration semantics still need manual acceptance.

<details>
<summary>中文</summary>

- 成稿自动保存到当前 dsh 会话工作区的 `notebook-studio/<会话专属目录>/`，同时保留 Office、PDF 和来源清单；旧成稿自动补存，重复读取不重复导出，重排另存新目录。工作区保存失败明确提示，不影响内部成稿下载；输出子目录不允许符号链接。
- Studio 增加报告和演示 PDF 内嵌预览、新窗口打开及实际保存路径。PDF 预览仍使用原会话鉴权，不接受任意文件路径；DOCX/PPTX 保留独立下载编辑。
- 修复「第 6 页核心结论未引用当前 PDF 摘录」的误导性校验：区分超长、缺失引用和过多引用，模型重试携带具体错误及上次 JSON；漏写引用时提供可用编号。真实无依据内容仍拒绝导出，不以补造引用绕过检查。
- 报告逐节、演示逐页根据正文规划原图、流程图、表格或可选生成图，取消全篇固定图数与固定图表页位；避免反复使用同一原图，生图提示词带入本节/页正文，失败以本节/页流程图补位并提示。新版本缓存与旧固定配图版本隔离；旧报告要重新生成才能获取新的模型视觉计划。
- 图注说明正文关联，来源清单保留章节/页、证据、原图页码与原始图注，生成图标明非实验结果。报告 PDF 按图注实际长度预留空间，演示图注限长显示、完整说明留在备注和清单。
- `npm run check`：**32 个 JavaScript + 2 个 Python 测试通过**。合成报告验证 4 节 7 个视觉素材（2 原图、3 生成图、1 流程图、1 表格），并检查章节顺序和长图注分页。独立 UI 测试壳使用实际 dsh React 与本版客户端，验证 1440×1000、390×844 的报告预览→关闭→演示预览，无控制台错误或横向溢出；这不是运行中 dsh 的端到端验收。
- 插件软链接已指向本仓库，运行中的 `dsh web` **未自动重启**；重启后加载新版 Host/Web Client。没有重新把真实文献交给云端模型，没有重新生成用户现有报告；现有报告仅补存工作区。真实生成内容与配图语义仍需人工验收。

</details>

## v0.3.2 · 2026-09-24 (local fix, not yet released / 本地修复，尚未发布)

- The outline is now generated in 4 batches of 14 pages (3–4 pages each), validating page count and PDF citations batch by batch, so the model is not asked for a complete 14-page outline in one shot and repeatedly failing; outlines with missing pages or no evidence are still rejected.
- When the optional image model fails to connect, times out or returns an error, reports skip AI illustrations and decks turn unfinished illustrations into editable flowcharts, then keep exporting DOCX/PDF and PPTX/PDF; successful tasks keep a degradation notice. User cancellation still stops the task.
- A degraded deck is not cached as a complete image result and can be re-rendered to restore AI illustrations after the image service recovers; cloud end-to-end generation with real papers still has not been run.
- `npm run check` passes 28 JavaScript and 2 Python tests, covering batched page-count validation, export in all four formats when the image service is unavailable, and explicit cancellation.

<details>
<summary>中文</summary>

- 大纲改为 4 批生成 14 页（每批 3–4 页），逐批校验页数及 PDF 引用，避免一次要求模型返回完整 14 页导致反复失败；仍不接受缺页或无证据大纲。
- 可选图片模型连接失败、超时或返回错误时，报告跳过 AI 示意图，演示将未完成的示意图改为可编辑流程图，继续导出 DOCX/PDF 与 PPTX/PDF；成功任务保留降级提示。用户中断仍会停止任务。
- 降级的演示不按完整生图结果缓存，修复图片服务后可重新渲染以补回 AI 示意图；真实文献云端端到端生成仍未执行。
- `npm run check` 通过 28 个 JavaScript 和 2 个 Python 测试，覆盖分批页数校验、图片服务不可用时的四种格式导出及主动取消。

</details>

## v0.3.1 · 2026-09-24 (local fix, not yet released / 本地修复，尚未发布)

- Fixed the `文本模型未完整返回：max-tokens` (incomplete text-model response) seen in reports/decks during per-paper summaries and later stages: DeepSeek structured JSON requests no longer emit reasoning output; summaries, topics, outlines, single-page drafts and reports use more sensible output budgets and retry a limited number of times only on explicit truncation. A standalone Chat Completions API with `finish_reason=length` is likewise no longer treated as a complete body.
- Background failures keep the actual processing stage, for example "per-paper summary 1/5", so a first-summary failure is distinguishable from an outline/report failure; when the budget is still exceeded an actionable error is returned instead of accepting incomplete JSON.
- `npm run check` passes **26 JavaScript + 2 Python** tests; three new regressions cover synthetic model truncation, retry and stage reporting. The user's real PDFs were not sent to the cloud again, and the running dsh still has to be restarted by the user to load the fix.

<details>
<summary>中文</summary>

- 修复报告/演示文稿在逐篇摘要等阶段出现的 `文本模型未完整返回：max-tokens`：DeepSeek 的结构化 JSON 请求关闭推理输出；摘要、主题、大纲、单页成稿和报告使用更合理的输出额度，并仅在明确截断时有限重试。独立 Chat Completions API 的 `finish_reason=length` 也不再被当作完整正文。
- 后台失败保留实际处理阶段，例如「逐篇摘要 1/5」，便于区分首篇摘要与大纲/报告成稿失败；仍超出额度时给出可操作错误，而非接受残缺 JSON。
- `npm run check` 通过 **26 个 JavaScript + 2 个 Python** 测试；新增三项合成模型截断/重试/阶段回归。未重新发送用户的真实 PDF 到云端，运行中的 dsh 仍需用户自行重启加载修复。

</details>

## v0.3.0 · 2026-09-24 (local development version, not yet released / 本地开发版本，尚未发布)

- Studio can tick the PDFs used for this generation; only the selected papers feed summaries, original figures, body citations and references. dsh web search can be enabled explicitly, with offline as the default; only prompt keywords are searched, results without excerpts, duplicates, non-HTTPS and obvious intranet addresses are filtered out, and `[Wn]` URL/time is labelled separately from paper page numbers.
- Decks gained a one-click "outline → per-page PDF-evidence draft → PPTX/PDF typesetting" flow; every page has a visible key conclusion, detailed discussion and speaker notes. The older editable-outline flow remains; per-page results are stored in SQLite and a retry does not regenerate completed pages.
- Report generation now includes per-paper PDF source page ranges and optional web background; DOCX/PDF body and the source list keep their own provenance. Both deliverables can be set to PPTX/PDF or DOCX/PDF before generation and downloaded in the chosen format afterwards, while the other format remains switchable.
- `npm run check` passes 23 JavaScript and 2 Python tests; synthetic papers and a mock search verify 30 papers, 6 web sources, selection isolation, offline by default, network failure, fabricated-citation rejection, editable PPTX, Chinese PDF content and cross-session download. No cloud text model or real search has been called for existing real papers yet; quality still needs an authorized manual blind review. The plugin symlink is kept and the running dsh is never restarted automatically.

<details>
<summary>中文</summary>

- Studio 可勾选本次生成的 PDF；仅使用所选文献做摘要、原图、正文引用和参考文献。可显式开启 dsh 网络搜索，离线为默认；仅搜索提示词关键词，过滤无摘录、重复、非 HTTPS 和明显内网地址，并把 `[Wn]` URL/时间与论文页码分开标注。
- 演示文稿新增一键「大纲→逐页 PDF 证据成稿→PPTX/PDF 排版」；每页有可见核心结论、详细论述及讲者备注。旧的可编辑大纲流程保留；逐页结果保存在 SQLite，重试不重复生成已完成页。
- 报告生成加入逐篇 PDF 原文页段和可选联网背景；DOCX/PDF 正文与来源清单保留各自出处。两种交付物可在生成前选择 PPTX/PDF 或 DOCX/PDF，生成后按所选格式下载，其他格式仍可切换。
- `npm run check` 通过 23 个 JavaScript 和 2 个 Python 测试；使用合成文献及模拟搜索验证 30 篇文献、6 条网络来源、选篇隔离、默认离线、网络故障、虚构引用拒绝、可编辑 PPTX、中文 PDF 内容与跨会话下载。尚未对现有真实文献调用云端文本模型或真实搜索；质量仍需用户授权后人工盲评。插件软链接保持，运行中的 dsh 不会被自动重启。

</details>

## v0.2.0 · 2026-09-24 (local development version, not yet released / 本地开发版本，尚未发布)

- Studio gained session-level model settings: choose a dsh provider/model, or configure a standalone OpenAI-compatible text API; the image model can be fully disabled or given its own Base URL/model/API key. Reading settings never returns the plaintext key.
- Two PDF import paths are supported: the chat input box and multiple files/folders inside Studio; both cap the count at 30 and require each file to be strictly smaller than decimal 30 MB. Studio uploads are written in chunks over authenticated RPC and deduplicated by SHA-256.
- Prompt-driven reports and decks. Reports export DOCX/PDF, a page-cited evidence table, original figures and editable flow/table content; decks export PPTX/PDF with an editable evidence table. Without image generation or original figures it keeps using flowcharts/tables and does not fabricate research images.
- PDFs use standalone Chinese typesetting and do not depend on LibreOffice; a usable CJK TTF font is required and other environments can set `STUDIO_CJK_FONT`. The source list keeps citations and image types.
- `npm ci && npm run check`: 18 JavaScript and 2 Python tests pass; synthetic material covers model routing, key redaction, upload boundaries, the four exports of reports and decks, and Chinese PDF extraction; no cloud end-to-end generation is run against existing real papers.
- The local `web` profile symlink still points at this repository, but the running dsh must be restarted by the user. No Git commit, tag or remote repository was created.

### Current limitations

- Scanned-file OCR is not supported; cloud text or image services only handle interface-compatible material the user is authorized to use. Whether the literature review content beats NotebookLM still needs a manual blind review.
- DOCX/PPTX and PDF come from the same structured content but are not a pixel-level copy of an Office conversion; the image-generation interface currently requires base64 PNG.

<details>
<summary>中文</summary>

- Studio 新增会话级模型设置：选择 dsh provider/model，或配置独立 OpenAI 兼容文本 API；图像模型可完全关闭，也可设置独立 Base URL/模型/API Key。读取设置不返回明文密钥。
- 支持聊天输入框与 Studio 内多文件/文件夹两种 PDF 导入；统一限制最多 30 篇、单篇严格小于十进制 30 MB。Studio 上传按认证 RPC 分块写盘，按 SHA-256 去重。
- 提示词驱动报告与演示文稿。报告导出 DOCX/PDF、页码证据表、文献原图与可编辑的流程表；演示文稿导出 PPTX/PDF，并加入可编辑的证据表。无生图或无原图时继续使用流程图/表格，不伪造研究图片。
- PDF 采用独立中文排版，不依赖 LibreOffice；需要可用的 CJK TTF 字体，其他环境可设 `STUDIO_CJK_FONT`。来源清单保留引用与图片类型。
- `npm ci && npm run check`：18 个 JavaScript、2 个 Python 测试通过；合成资料覆盖模型路由、密钥脱敏、上传边界、报告与幻灯片的四种导出及中文 PDF 提取；不对现有真实文献运行云端端到端生成。
- 本地 `web` profile 原软链接仍指向本仓库，但运行中的 dsh 需由用户自行重启。未创建 Git 提交、标签或远程仓库。

### 当前边界

- 不支持扫描件 OCR；云端文本或图片服务仅能处理接口兼容且用户已授权的资料。文献综述内容是否优于 NotebookLM 仍需人工盲评。
- DOCX/PPTX 与 PDF 来自同一结构化内容但不是 Office 转换的像素级副本；生成图片接口目前要求 base64 PNG。

</details>

## v0.1.0 · 2026-09-24 (local version, not yet released / 本地版本，尚未发布)

### Features

- A standalone dsh Host/Web Client plugin; one session maps to one literature project, reusing `dsh-paste-input-plus` to upload up to 30 text-based PDFs.
- PyMuPDF extracts page text, captions and original figure regions, SQLite FTS5 provides retrieval, and paper IDs, PDF page numbers and evidence IDs are preserved for each argument.
- dsh's DeepSeek Flash generates an editable outline in layers; the local Qwen-Image 2.1 generates two concept images sequentially, and PptxGenJS exports a 15-page editable PPTX plus a source list.
- Failure states, retries, restart recovery, content-hash deduplication, and session-isolated download and retrieval tools.

### Verification

- Real PDFs: the first batch of 12, later extended to 30; 151 candidate images and 2,129 retrieval passages extracted.
- `npm run check`: 10 JavaScript tests and 2 Python tests pass; a 15-page layout sample was checked with native PowerPoint.
- The local Qwen endpoint was measured returning a single valid PNG; the sample used a mock text outline, and full DeepSeek cloud outline generation against real papers has **not** been run.

### Known limitations and upgrade

- No scanned-file OCR, audio/video, standalone web app or MCP service; paper excerpts are sent to the configured DeepSeek cloud, so confirm the material's usage license first.
- Requires the dsh `web` profile's `@qithird/dsh-paste-input-plus@0.2.1`, Node.js 24, Python 3.12/PyMuPDF and a local Qwen service.
- The plugin package name, Cordis ID and Web label are now unified as `dsh-notebook-studio` / Notebook Studio. To migrate an old installation, remove the old package name and add this repository directory; the skill symlink should also point at the new location. A running `dsh web` still has to be restarted manually. User papers and historical acceptance caches are not part of this Git repository.
- This version created no Git commit, tag or remote repository; commit or publish only after the code and material boundaries are confirmed.

<details>
<summary>中文</summary>

### 功能

- 独立的 dsh Host/Web Client 插件；一个会话对应一个文献项目，复用 `dsh-paste-input-plus` 上传最多 30 篇文字版 PDF。
- PyMuPDF 提取逐页文字、图注与原图区域，SQLite FTS5 检索并为论点保留文献 ID、PDF 页码及证据 ID。
- 经 dsh 的 DeepSeek Flash 分层生成可编辑大纲；本机 Qwen-Image 2.1 顺序生成两张概念图，PptxGenJS 导出 15 页可编辑 PPTX 与素材来源清单。
- 失败状态、重试、重启恢复、内容哈希去重及按会话隔离的下载和检索工具。

### 验证

- 真实 PDF 首批 12 篇、追加至 30 篇；提取 151 张候选图、2,129 条检索片段。
- `npm run check`：10 个 JavaScript 测试、2 个 Python 测试通过；PowerPoint 原生检查了 15 页排版样稿。
- 本机 Qwen 接口已实测单张有效 PNG；样稿使用模拟文本大纲，**尚未**对真实文献运行完整的 DeepSeek 云端大纲生成。

### 已知限制与升级

- 不支持扫描件 OCR、音视频、独立 Web 应用或 MCP 对外服务；文献摘录会送往配置的 DeepSeek 云端，需先确认资料使用许可。
- 需要 dsh `web` profile 的 `@qithird/dsh-paste-input-plus@0.2.1`、Node.js 24、Python 3.12/PyMuPDF 和本机 Qwen 服务。
- 插件包名、Cordis ID 和 Web 标签现统一为 `dsh-notebook-studio` / Notebook Studio。迁移旧安装时应移除旧包名，再添加本仓库目录；技能软链接也应指向新位置。运行中的 `dsh web` 仍需手动重启。用户文献及历史验收缓存不在此 Git 仓库中。
- 本版本未创建 Git 提交、标签或远程仓库；确认代码及资料边界后再提交或发布。

</details>
