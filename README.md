# dsh-notebook-studio

**English** | [中文](README.zh.md)

Treat one dsh session as a literature project: import up to 30 text-based PDFs, choose which papers this run uses, search page-anchored evidence, and turn a prompt into a **report (DOCX/PDF)** or a **deck (PPTX/PDF)**. Finished documents are saved automatically into the current session workspace and can be previewed as PDF inside Studio. Web background is optional and off by default; original figures, editable flowcharts and evidence tables are planned per section and per page, with AI concept illustrations an optional extra instead of one fixed image for every section.

This is a standalone Git repository; it does not contain dsh itself, your papers, or generated documents. Repository: <https://github.com/HaoKuo/dsh-notebook-studio>. The version history is in `RELEASE_NOTES.md`.

## Requirements and installation

- DeepSeek Harness `0.1.7-rc.2` (the development and acceptance baseline; dependencies are pinned to it), Node.js 24, Python 3.12/PyMuPDF. Text models can be any model already registered in dsh, or a standalone service compatible with OpenAI Chat Completions.
- PDFs are typeset directly with PDFKit and need a TTF font that carries CJK glyphs. On this machine Arial Unicode is selected automatically; elsewhere set `STUDIO_CJK_FONT=/path/to/font.ttf`. When no CJK glyphs can be found, the failure is explicit.
- Optional: `@qithird/dsh-paste-input-plus@0.2.1` provides PDF upload from the **chat input box**. In-Studio file/folder upload does not depend on that plugin. An optional image service must return base64 PNG from `images/generations`.
- Optional web references use dsh's `ctx.web.search` and require the dsh deployment to configure a working search provider. When the service is unavailable, or no HTTPS result with an excerpt comes back, the task fails explicitly rather than quietly degrading into an offline document.

Run from the repository root:

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run check
dsh plugin --profile web add "$PWD"
mkdir -p "$HOME/.dsh/skills"
ln -sfn "$PWD/.agents/skills/research-studio" "$HOME/.dsh/skills/research-studio"
```

When `dsh` is not on `PATH`, use the absolute path to its executable instead. In this machine's `web` profile the plugin and the skill are already symlinked to this repository; **do not let the install command stand in for confirmation**. After installing or updating, the user schedules the restart of the running `dsh web` themselves so the Web client is rebundled. This task never stops or restarts a running dsh.

## Language

The plugin follows the dsh language setting (Settings → General → Language, `zh`/`en`). At load the Web client reads the active locale from the host locale service and fetches one catalog from the host (`getMessages`); catalog keys are the Chinese source strings, so a missing translation falls back to the Chinese text instead of an empty label. Switching the language re-renders an open workbench. The host-side `studio_search` text (tool description and the guidance returned to the model) follows an explicitly selected non-Chinese preference and otherwise stays in the source language.

## Usage

**v0.5.1 keeps a single sidebar entry**: click **NotebookStudio** above "Plugins" on the left of dsh and the workbench opens in the main area while the host's left navigation stays. The session tab and the session-top Studio button are gone. Inside the workbench the library sits on the left, the body editor / PDF preview in the middle, and authoring settings on the right; both side columns collapse. The top bar gathers project, task progress, generation and export, while model configuration lives in the gear settings. Buttons, backgrounds, text, borders and status colors use dsh theme variables directly and follow the light/dark theme; the old standalone teal palette is gone. On narrow screens the layout stacks vertically with the content area first.

1. Select a dsh session first, then click **NotebookStudio** on the left; "Back to chat" returns to the original session view without switching sessions. When there is no current session you get guidance to select or create one: no project is created automatically and no other session's papers are read. To switch projects, select another session in the host sidebar and click NotebookStudio again. Send PDFs from the chat box paperclip, or select multiple PDFs / a folder in the library. Non-PDF files in a folder are skipped. Each project holds at most 30 papers, each of which must be non-empty and **strictly smaller than 30,000,000 bytes (30 MB)**; duplicates are removed by content hash. Scans are not OCR'd yet. Leaving the workbench cancels uploads that have not finished; papers already indexed are kept and background generation keeps running.
2. In "Model settings", select a loaded dsh text model, or fill in the Base URL, model name and API key of a standalone API. dsh's DeepSeek Flash is the default. The image model is off by default; enable it when needed and enter an endpoint and model compatible with `/v1/images/generations`, leaving the API key empty for a local Qwen. A single image waits 600 seconds by default, configurable from 30 to 1800 seconds; raise it when a model is slow to cold-start.
3. Wait until the papers show "indexed", tick the PDFs used by this run (all indexed papers are selected by default), and fill in the writing goal on the right. Tick "Add web search references" only when external background is wanted: only prompt keywords are sent to dsh search, never PDF body text. Web references are listed separately with `[Wn]`, URL and retrieval time, and cannot be passed off as `[n] PDF p.x` paper evidence.
4. Choose the report format **DOCX or PDF** and click "Generate full report"; choose the deck format **PPTX or PDF** and click "Generate full deck". The deck first synthesizes the selected PDFs in 4 batches into a 14-page cited outline, then walks page by page pulling PDF excerpts into detailed conclusions, argumentation and speaker notes, and typesets at the end. The middle "outline" step is optional: you can generate, edit and save it first, then produce the detailed document from it; an older outline stays bound to the paper selection and web results of the run that created it.
5. After the task succeeds, click "Preview document" to inspect the PDF, use "Export" at the top to download the selected format, and "Files and sources" for the actual paths and the source list. DOCX/PPTX, PDF and the source JSON are saved together under `notebook-studio/<session-specific directory>/<report|deck-random suffix>/` in the **current dsh session workspace**; this is not the plugin repository directory. Re-typesetting saves into a new directory and never overwrites a copy the user has edited. Completed per-page deck drafts are cached for retry after a failure.
   Illustrations are planned from the body: each report section may carry 0–2 visuals and each deck page one main visual area, with no fixed count for the whole document. Related results use original figures, procedures and mechanisms use flowcharts, multi-paper comparisons use tables, and abstract concepts may use AI illustrations; every image keeps the purpose and source of its section/page. Image generation runs serially; on failure the UI reports it and fills the slot with the flowchart for that section/page rather than passing it off as a paper result. Once the service recovers, re-typeset to retry image generation.
6. Click "Open body editor" to change the title, the report summary/paragraphs/table conclusions, or the per-page discussion/key conclusion/speaker notes; then "Save and re-typeset". This does not call a text model to rewrite the body, and it rejects changes to citation IDs or asset sources; conclusions you edit still need manual evidence checking. With an image service enabled, re-typesetting may request concept illustrations. A typesetting failure keeps the edited draft and refuses to overwrite a newer version with a stale one; existing exports are untouched. Older decks restore their body from the source list instead of passing the current outline off as the body.
7. Within the same browser page, leaving and re-entering NotebookStudio keeps that session's prompt, paper selection and edited drafts; different sessions stay isolated. Refreshing or closing the page warns when the workbench holds unsaved drafts; refreshing after leaving the workbench also loses in-memory drafts, so save first. This is not cross-device or post-restart draft recovery. Successfully generated content is already stored in the host database and files.
8. Use `studio_search` in Chat for Q&A; answers should carry evidence IDs, paper names and PDF page numbers. On the left you can search evidence, view task records and retry failed papers.

### Host compatibility scope

This round is built on the public slot contract and the actual React runtime implementation of **dsh 0.1.7-rc.2**. The entry registers into `sidebar.panellist` (order -10, where the host's "Plugins" is 0), the workbench registers into `main`, reads the current session through the `session-maybe` sub-slot, and returns with `layout.selectPanel(null)`. No host core layout, private route or simulated click is touched; navigation row styling and collapse hints are managed by the host. Isolated UI and host composition tests exist; the UI test loads the actual host navigation row component and the light/dark theme CSS.

Acceptance status on `0.1.7-rc.2`: `npm run check` passes **40 JavaScript + 2 Python tests** against the pinned `0.1.7-rc.2` packages; `dsh --profile web --dump-config` composes the profile with the plugin layer; and the running `dsh web` instance (0.1.7-rc.2) mounts the host side, where `studio_search` answers without error. **Not yet verified**: a full cloud generation with real papers under 0.1.7-rc.2, and deployment acceptance in a restarted instance that has picked up the new dependency tree — a restart is required for that, after which run one real report and one real deck. Host versions other than `0.1.7-rc.2` are outside this acceptance.

After an upgrade, opening Studio automatically back-fills the session's most recent completed documents into the workspace **without rewriting the old content**. To adopt the new content-planned illustrations, click generate report / full deck again; "Re-typeset" only reuses the saved body and visual plan. When the workspace is missing or not writable, internal documents, download and preview are kept and the UI explicitly reports the save failure.

## Layout and security

- `src/`: host, authenticated RPC, uploads, SQLite FTS5, model calls, DOCX/PPTX and standalone PDF typesetting; `lib/client.js`: the sidebar entry and the session-isolated Studio main panel; `worker/`: PyMuPDF parsing; `tests/`: synthetic material and client-registration contract regressions; `.agents/skills/`: the retrieval skill.
- The internal database, original PDFs, extracted images and document caches stay in `~/.dsh/studio/v1/<session-specific directory>/`; deliverable Office files, PDFs and source lists are additionally saved into the session workspace. Output paths come only from the host session `cwd`: neither the model nor the client can name arbitrary file paths, and symlinks in output subdirectories are rejected. Studio uploads in 512 KiB chunks through the authenticated dsh Connection; the server only handles staging files it created itself. The chat-box entry still verifies the session manifest and directory ownership. Downloads and previews are validated against record IDs belonging to the current session.
- API keys are kept in a permission-restricted SQLite file for that project; reading settings returns only "configured" and never the plaintext. The text API receives the **excerpts of the selected PDFs** used for summaries and per-page drafts; web search receives only user prompt keywords; with a cloud image API enabled, illustration prompts also go to that service. Confirm your rights for paper upload, original-figure use and the API provider first. Images are never labelled as experimental results.
- DOCX/PPTX are editable; PDFs are typeset separately from the same content and are **not a pixel-perfect Office conversion**. Without original figures or an image model you still get evidence-backed native flowcharts and comparison tables. Quality, and any claim of being "better than NotebookLM", must be established by manual comparison; automated tests alone cannot support it.

Run `npm run check` to verify JS/Python; full cloud generation and real web retrieval with real papers **have not been executed with permission**. Older versions on this machine imported and extracted images from 12–30 real PDFs; this version's generation and web use are tested with synthetic material and mock interfaces, and never send those papers to the cloud automatically.

### Page 6: "conclusion does not cite the current PDF excerpt"

`v0.4.0` split the checks for conclusion length, missing citations and excessive citations: the old code misreported a conclusion longer than 120 characters as a citation error. Retries hand the specific fields, constraints and previous JSON to the model for repair, and state which numbers are available on that page when `refs` are missing; fabricated citations are never inserted automatically and no unsupported document is accepted. Previously invalid per-page caches are regenerated. Regressions cover an over-long page-6 conclusion, a fix after omitted citations, and rejection of persistently fabricated citations.

### Zero-byte downloads, blank Studio preview

`v0.4.1` fixed the download route missing `requestBody: 'buffered'`: in dsh `0.1.6-alpha.2` this made GET requests wrongly constructed with a request body and returned an empty HTTP 400. All six file routes now declare the correct mode and support HEAD preview checks; downloads check HTTP status, file size and transfer length first, and errors are no longer saved as empty files labelled "successful downloads".

This did not mean the server failed to generate the body, nor was it an image-model downgrade. After updating and reloading the plugin, download again from "Documents"; no new text-model call is needed. You can also open the original document in the workspace directly.

### Text model output truncated

`max-tokens` means the model reached this call's output ceiling, not that PDF import failed. `v0.3.1` disables unnecessary reasoning output for DeepSeek structured writing, raises the budgets for summaries, outlines, per-page drafts and reports, and retries a limited number of times with a higher budget when truncation is explicit; if it still fails, the task keeps the concrete stage and suggests a model with longer output or a narrower generation scope. After updating the plugin the user must restart the running `dsh web` themselves, then click generate again; completed per-paper summaries and per-page drafts continue to be reused.

## License

MIT — see [LICENSE](LICENSE).
