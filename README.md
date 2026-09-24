# dsh-notebook-studio

**English** | [中文](README.zh.md)

Treat one dsh session as a literature project: import up to 30 text-based PDFs, pick which papers this run uses, search page-anchored evidence, and turn a prompt into a **report (DOCX/PDF)** or a **deck (PPTX/PDF)**. Finished documents are saved into the current session workspace and can be previewed as PDF inside Studio. Web background is optional and off by default; original figures, editable flowcharts and evidence tables are planned per section and page, with AI concept illustrations an optional extra.

Repository: <https://github.com/HaoKuo/dsh-notebook-studio> · Version history: `RELEASE_NOTES.md`

## Requirements and installation

- DeepSeek Harness `0.1.7-rc.2` (`engines.dsh`), Node.js 24, Python 3.12 with PyMuPDF.
- PDF typesetting uses PDFKit and needs a TTF font carrying CJK glyphs: Arial Unicode is picked up automatically, otherwise set `STUDIO_CJK_FONT=/path/to/font.ttf`.
- Optional: `@qithird/dsh-paste-input-plus@0.2.1` for PDF upload from the chat input box (in-Studio upload does not need it); an image service returning base64 PNG from `images/generations`; web references through dsh's `ctx.web.search`, which fails explicitly when no provider is configured.

From the repository root:

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run check
dsh plugin --profile web add "$PWD"
mkdir -p "$HOME/.dsh/skills"
ln -sfn "$PWD/.agents/skills/research-studio" "$HOME/.dsh/skills/research-studio"
```

### Install from GitHub

The Host installs git sources through pnpm, so no local clone is needed:

```sh
dsh plugin --profile web add github:HaoKuo/dsh-notebook-studio
# pin a release:  github:HaoKuo/dsh-notebook-studio#v0.6.1
```

PDF parsing resolves an interpreter in this order: `STUDIO_PYTHON` (which must be usable when set) → the package's `.venv` → `python3`/`python` on `PATH`; the candidate has to `import pymupdf`, and when none qualifies the error names every candidate plus the fix:

```sh
python3 -m venv ~/.venv-studio && ~/.venv-studio/bin/pip install "PyMuPDF>=1.26,<2"
export STUDIO_PYTHON=~/.venv-studio/bin/python    # before starting dsh web
```

Restart `dsh web` after installing or updating so the Web client is rebundled.

## Usage

The workbench opens from **NotebookStudio** above "Plugins" in the dsh sidebar: library on the left, body editor / PDF preview in the middle, authoring settings on the right, models and APIs in the gear settings. "Back to chat" returns to the session without switching it.

1. Select a dsh session, then click **NotebookStudio**; with no session you are asked to pick or create one. To switch projects, choose another session in the host sidebar.
2. Add papers from the chat-box paperclip or from the library (multiple files or a folder; non-PDFs are skipped). Up to 30 per project, each non-empty and **strictly under 30,000,000 bytes (30 MB)**, deduplicated by content hash. Scans are not OCR'd. Leaving the workbench cancels unfinished uploads; indexed papers and running tasks continue.
3. In "Model settings" choose a loaded dsh text model (DeepSeek Flash by default) or enter a standalone API's Base URL, model and key. The image model is off by default; when enabled it needs an endpoint compatible with `/v1/images/generations` (leave the key empty for a local Qwen). One image waits 600 s by default, configurable to 30–1800 s.
4. Once papers show "indexed", tick the ones this run uses and write the goal. "Add web search references" sends prompt keywords only, never PDF text; web sources are listed as `[Wn]` with URL and time and never count as `[n] PDF p.x` paper evidence.
5. Choose **DOCX or PDF** and click "Generate full report", or **PPTX or PDF** and click "Generate full deck". A deck first builds a 14-page cited outline in 4 batches, then drafts each page from PDF excerpts (conclusion, argument, speaker notes) and typesets. The outline step is optional: generate, edit and save it, then build the document from it.
6. Illustrations follow the body: 0–2 visuals per report section, one main visual area per deck page. Results use original figures, mechanisms use flowcharts, comparisons use tables, abstract concepts may use AI illustrations; generation runs serially and a failure falls back to that section's or page's flowchart instead of passing it off as a paper result.
7. "Preview document" shows the PDF, "Export" downloads the chosen format, and "Files and sources" lists real paths and provenance. Deliverables land in `notebook-studio/<session directory>/<report|deck-suffix>/` inside the **current session workspace**; re-typesetting writes a new directory and never overwrites an edited copy.
8. "Open body editor" changes the title, summaries, paragraphs, table findings and per-page text; "Save and re-typeset" applies them without calling a text model to rewrite the body and rejects edits to citation IDs or asset sources, so edited conclusions still need manual evidence checking.
9. Within one browser page, leaving and re-entering NotebookStudio keeps this session's prompt, paper selection and drafts; sessions stay isolated, and unsaved drafts are lost on refresh. Generated content is already stored in the host database and files.
10. Use `studio_search` in Chat for Q&A; answers carry evidence IDs, paper names and PDF pages. The left column also searches evidence, lists task records and retries failed papers.

### Host compatibility

The plugin uses public host slots only: the entry registers into `sidebar.panellist`, the workbench into `main`, the current session is read through the `session-maybe` sub-slot, and "Back to chat" calls `layout.selectPanel(null)`. No private route, core layout change or simulated click. Verified on dsh `0.1.7-rc.2` with `npm run check` (41 JavaScript + 2 Python tests), profile composition and the host-side plugin mounting in a running `dsh web`.

## Layout and security

- `src/` host (RPC, uploads, SQLite FTS5, model calls, DOCX/PPTX/PDF), `lib/client.js` Web client, `worker/` PyMuPDF parsing, `tests/` regressions, `.agents/skills/` the retrieval skill.
- The internal database, original PDFs, extracted figures and caches stay in `~/.dsh/studio/v1/<session directory>/`; deliverables are additionally written to the session workspace. Output paths come only from the host session `cwd`, so neither the model nor the client can name arbitrary paths and symlinked output subdirectories are rejected. Uploads go through the authenticated dsh Connection in 512 KiB chunks; downloads and previews are validated against record IDs of the current session.
- API keys live in a permission-restricted SQLite file and reading settings returns only "configured". The text API receives the **excerpts of the selected PDFs**, web search receives prompt keywords only, and an enabled cloud image service receives illustration prompts. Check your rights for paper upload, figure reuse and each API provider; images are never labelled as experimental results.
- DOCX/PPTX stay editable; PDFs are typeset from the same content and are not a pixel-perfect Office conversion. Without original figures or an image model you still get native flowcharts and comparison tables. Quality claims need manual comparison.

Run `npm run check` to verify JavaScript and Python. Cloud generation and real web retrieval with real papers are not part of the automated suite.

## License

MIT — see [LICENSE](LICENSE).
