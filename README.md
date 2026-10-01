# dsh-notebook-studio

**English** | [中文](README.zh.md)

Upload a set of PDF papers into a dsh session and work on them with prompts: review the literature, extract key findings, shape research ideas and a study design, and generate a page-cited **report (DOCX/PDF)** or **slide deck (PPTX/PDF)**. Every claim stays tied to `[n] PDF p.x` evidence, and deliverables are written into the session workspace.

Repository: <https://github.com/HaoKuo/dsh-notebook-studio> · Version history: `RELEASE_NOTES.md`

## Features

- **Upload a paper set** — up to 30 text-based PDFs per session project, from files or a whole folder (non-PDFs skipped), deduplicated by content hash; each paper shows its own status, failures explain themselves and can be retried, and scans are not OCR'd.
- **Review the literature** — give a goal such as "compare the evidence and the disagreements around X" and get a 4–7 section review whose every paragraph cites the PDF pages it came from, ending with a reference list.
- **Extract key findings** — pull methods, samples, results and limitations out of the corpus, and get a cross-paper evidence table where each entry links back to a paper and a page.
- **Shape research ideas and a study design** — reuse the same cited evidence to draft research questions, gaps, ideas and a study design; this is model synthesis on top of the papers, so the facts still point at `[n] PDF p.x`.
- **Generate a report** — DOCX or PDF, with an executive overview, sections, evidence table, original figures and references.
- **Generate a slide deck** — PPTX or PDF; a cited outline is built first and can be edited and saved, then every page is drafted with a key conclusion, discussion and speaker notes.
- **Ask the papers in chat** — `studio_search` answers with paper, PDF page, evidence ID and excerpt, and a Chinese question is rewritten into English keywords first.
- **Illustrate from the content** — 0–2 visuals per report section and one main visual per deck page: original figures, editable flowcharts, evidence tables, and optional AI concept illustrations that are never presented as paper results.
- **Edit, preview, export, trace** — edit any text and re-typeset into a new directory (existing exports are never overwritten), preview the PDF inside Studio, download DOCX/PPTX/PDF or the source JSON, and see the real paths and provenance behind every citation.
- **Choose your models** — any model registered in dsh or a standalone OpenAI-compatible endpoint; keys stay local, image generation is optional and off by default, and web references are optional keyword-only `[Wn]` entries.
- **Run in the background** — leaving the workbench does not stop a job; the task record lists type, time and duration, retries reuse finished pages and papers, and uploads can be cancelled.
- **Scope** — text-based PDFs only (no OCR), 30 papers per project, single user; no audio/video overview, mind map, flashcard, quiz or infographic output, and no shared notebooks.

## Requirements and installation

- DeepSeek Harness `0.1.7-rc.2` or `0.2.0-rc.2` (`engines.dsh`), Node.js 24, Python 3.12 with PyMuPDF.
- PDF typesetting needs a TTF font carrying CJK glyphs: Arial Unicode is used automatically, otherwise set `STUDIO_CJK_FONT=/path/to/font.ttf`.
- Optional: an image service compatible with `images/generations` (base64 PNG); dsh's `ctx.web.search` for web references.

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
# pin a release:  github:HaoKuo/dsh-notebook-studio#v0.6.2
```

PDF parsing looks for `STUDIO_PYTHON` (which must be usable when set) → the package's `.venv` → `python3`/`python` on `PATH`, and requires `import pymupdf`; when none qualifies the error lists every candidate and the fix:

```sh
python3 -m venv ~/.venv-studio && ~/.venv-studio/bin/pip install "PyMuPDF>=1.26,<2"
export STUDIO_PYTHON=~/.venv-studio/bin/python    # before starting dsh web
```

Restart `dsh web` after installing or updating so the Web client is rebundled.

## Usage

The workbench opens from **NotebookStudio** above "Plugins" in the dsh sidebar: library on the left, editor / PDF preview in the middle, authoring settings on the right, models and APIs in the gear settings. "Back to chat" returns to the session without switching it.

1. Select a dsh session, then click **NotebookStudio**; with no session you are asked to pick or create one. To switch projects, choose another session in the host sidebar.
2. Add papers from the library (multiple files or a folder; non-PDFs are skipped). Up to 30 per project, each non-empty and **strictly under 30,000,000 bytes (30 MB)**, deduplicated by content hash; scans are not OCR'd. Leaving the workbench cancels unfinished uploads, while indexed papers and running tasks continue.
3. In "Model settings" choose a loaded dsh text model (DeepSeek Flash by default) or enter a standalone API's Base URL, model and key. The image model is off by default; when enabled it needs an endpoint compatible with `/v1/images/generations` (leave the key empty for a local Qwen). One image waits 600 s by default, configurable to 30–1800 s.
4. Once papers show "indexed", tick the ones this run uses and write the goal. "Add web search references" sends prompt keywords only, never PDF text; web sources are listed as `[Wn]` with URL and time and never count as `[n] PDF p.x` paper evidence.
5. Choose **DOCX or PDF** and click "Generate full report", or **PPTX or PDF** and click "Generate full deck". A deck builds a cited outline first, then drafts every page from PDF excerpts (conclusion, argument, speaker notes) and typesets; the outline can be generated, edited and saved before building.
6. Illustrations follow the body: 0–2 per report section, one main visual per deck page — figures for results, flowcharts for mechanisms, tables for comparisons, AI illustrations for abstract concepts. Generation is serial, and a failure falls back to that section's or page's flowchart instead of passing it off as a paper result.
7. "Preview document" shows the PDF, "Export" downloads the chosen format, and "Files and sources" lists real paths and provenance. Deliverables land in `notebook-studio/<session directory>/<report|deck-suffix>/` inside the **current session workspace**; re-typesetting writes a new directory and never overwrites an edited copy.
8. "Open body editor" edits titles, summaries, paragraphs, table findings and per-page text; "Save and re-typeset" applies them without a text-model rewrite and rejects changes to citation IDs or asset sources, so edited conclusions still need manual evidence checking.
9. Within one browser page, leaving and re-entering NotebookStudio keeps this session's prompt, paper selection and drafts; sessions stay isolated, and unsaved drafts are lost on refresh.
10. Use `studio_search` in Chat for Q&A; answers carry evidence IDs, paper names and PDF pages. The left column also searches evidence, lists task records and retries failed papers.

### Host compatibility

The plugin uses public host slots only (`sidebar.panellist`, `main`, the `session-maybe` sub-slot, `layout.selectPanel(null)`), with no private routes, core-layout changes or simulated clicks. Verified on dsh `0.2.0-rc.2` and `0.1.7-rc.2`: `npm run check`, profile composition, and host-side mounting in a running `dsh web`.

## Layout and security

- `src/` host (RPC, uploads, SQLite FTS5, model calls, DOCX/PPTX/PDF), `lib/client.js` Web client, `worker/` PyMuPDF parsing, `tests/` regressions, `.agents/skills/` the retrieval skill.
- The internal database, original PDFs, extracted figures and caches stay in `~/.dsh/studio/v1/<session directory>/`; deliverables are additionally written to the session workspace. Output paths come only from the host session `cwd` — neither the model nor the client can name arbitrary paths, and symlinked output subdirectories are rejected. Uploads are authenticated, and downloads and previews are validated against record IDs of the current session.
- API keys live in a permission-restricted SQLite file and reading settings returns only "configured". The text API receives **excerpts of the selected PDFs**, web search receives prompt keywords only, and an enabled cloud image service receives illustration prompts. Check your rights for paper upload, figure reuse and each API provider; images are never labelled as experimental results.
- DOCX/PPTX stay editable; PDFs are typeset from the same content and are not a pixel-perfect Office conversion. Without original figures or an image model you still get native flowcharts and comparison tables; quality claims need manual comparison.

`npm run check` covers JavaScript and Python; cloud generation and real web retrieval with real papers are not part of the automated suite.

## License

MIT — see [LICENSE](LICENSE).
