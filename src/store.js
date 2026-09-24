import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DEFAULT_SETTINGS, publicSettings, textFingerprint, validateSettings } from './settings.js'

export const MAX_FILES = 30
export const MAX_FILE_BYTES = 30_000_000
export const MAX_PROJECT_BYTES = MAX_FILES * (MAX_FILE_BYTES - 1)

const SOURCE_ID = /^sha256:[0-9a-f]{64}$/

export function projectDirectory(root, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 256) {
    throw new Error('无效的会话 ID')
  }
  const slug = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48)
  const digest = createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
  return join(root, `${slug}-${digest}`)
}

export function defaultDataRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'studio', 'v1')
}

export function sourceId(ref) {
  if (!ref || !SOURCE_ID.test(ref.attachmentId)) throw new Error('无效的附件引用')
  if (!Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes >= MAX_FILE_BYTES) {
    throw new Error('单篇 PDF 必须小于 30 MB，且不能为空')
  }
  if (typeof ref.name !== 'string' || !ref.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('仅支持 PDF 文献')
  }
  return ref.attachmentId
}

function splitPage(text, maxCharacters = 2500, overlap = 240) {
  const chunks = []
  let offset = 0
  while (offset < text.length) {
    let end = Math.min(offset + maxCharacters, text.length)
    if (end < text.length) {
      const sentence = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('\n', end))
      if (sentence > offset + maxCharacters / 2) end = sentence + 1
    }
    const chunk = text.slice(offset, end).trim()
    if (chunk) chunks.push(chunk)
    if (end === text.length) break
    offset = Math.max(offset + 1, end - overlap)
  }
  return chunks
}

function matchQuery(query) {
  const words = [...new Set((query.match(/[a-z][\w-]{1,}|[\p{Script=Han}]{2,}/giu) || [])
    .map(word => word.replaceAll('"', '').toLowerCase()))].slice(0, 12)
  if (!words.length) return null
  return words.map(word => `"${word}"`).join(' OR ')
}

export class StudioStore {
  constructor(sessionId, root = defaultDataRoot()) {
    this.sessionId = sessionId
    this.directory = projectDirectory(root, sessionId)
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    mkdirSync(join(this.directory, 'sources'), { recursive: true, mode: 0o700 })
    mkdirSync(join(this.directory, 'figures'), { recursive: true, mode: 0o700 })
    mkdirSync(join(this.directory, 'generated'), { recursive: true, mode: 0o700 })
    mkdirSync(join(this.directory, 'decks'), { recursive: true, mode: 0o700 })
    mkdirSync(join(this.directory, 'reports'), { recursive: true, mode: 0o700 })
    mkdirSync(join(this.directory, 'uploads'), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(join(this.directory, 'studio.sqlite'))
    chmodSync(join(this.directory, 'studio.sqlite'), 0o600)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, bytes INTEGER NOT NULL,
        title TEXT, doi TEXT, page_count INTEGER, status TEXT NOT NULL,
        error TEXT, added_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pages (
        source_id TEXT NOT NULL REFERENCES sources(id), page INTEGER NOT NULL,
        text TEXT NOT NULL, PRIMARY KEY(source_id, page)
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
        page INTEGER NOT NULL, part INTEGER NOT NULL, text TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        chunk_id UNINDEXED, text, tokenize='unicode61'
      );
      CREATE TABLE IF NOT EXISTS figures (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
        page INTEGER NOT NULL, caption TEXT NOT NULL, path TEXT NOT NULL,
        bbox TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        score REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paper_summaries (
        source_id TEXT PRIMARY KEY REFERENCES sources(id), data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS theme_batches (
        batch_hash TEXT PRIMARY KEY, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outline (
        id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL,
        data TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
        phase TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generated_assets (
        prompt_hash TEXT PRIMARY KEY, prompt TEXT NOT NULL, model TEXT NOT NULL,
        path TEXT NOT NULL, metadata TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY, outline_revision INTEGER NOT NULL,
        path TEXT NOT NULL, manifest_path TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deck_slide_drafts (
        prompt_hash TEXT NOT NULL, slide_index INTEGER NOT NULL,
        data TEXT NOT NULL, PRIMARY KEY(prompt_hash, slide_index)
      );
      CREATE TABLE IF NOT EXISTS imports (
        send_id TEXT PRIMARY KEY, state TEXT NOT NULL, error TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS import_errors (
        send_id TEXT NOT NULL, name TEXT NOT NULL, error TEXT NOT NULL,
        PRIMARY KEY(send_id, name)
      );
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, prompt_hash TEXT NOT NULL, data TEXT NOT NULL,
        docx_path TEXT, pdf_path TEXT, manifest_path TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_exports (
        kind TEXT NOT NULL, artifact_id TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(kind, artifact_id)
      );
    `)
    if (!this.db.prepare('PRAGMA table_info(decks)').all().some(row => row.name === 'pdf_path')) {
      this.db.exec('ALTER TABLE decks ADD COLUMN pdf_path TEXT')
    }
    if (!this.db.prepare('PRAGMA table_info(decks)').all().some(row => row.name === 'prompt_hash')) {
      this.db.exec('ALTER TABLE decks ADD COLUMN prompt_hash TEXT')
    }
    // 进程崩溃后保留已完成的分析；仅重新排队未完成的文献。
    this.db.exec("UPDATE sources SET status='queued' WHERE status='indexing';")
    this.db.exec("UPDATE jobs SET state='interrupted' WHERE state='running';")
    this.db.exec("UPDATE imports SET state='pending' WHERE state='running';")
  }

  close() {
    this.db.close()
  }

  getSettings() {
    const row = this.db.prepare('SELECT data FROM settings WHERE id=1').get()
    return row ? JSON.parse(row.data) : structuredClone(DEFAULT_SETTINGS)
  }

  publicSettings() {
    return publicSettings(this.getSettings())
  }

  saveSettings(input) {
    const old = this.getSettings()
    const next = validateSettings(input, old)
    this.db.prepare(`INSERT INTO settings(id,data) VALUES(1,?)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(JSON.stringify(next))
    if (textFingerprint(old) !== textFingerprint(next)) {
      // 不复用由其他文本模型写出的摘要；已导出文件保持不变。
      this.db.exec('DELETE FROM paper_summaries; DELETE FROM theme_batches;')
    }
    return publicSettings(next)
  }

  addSource(ref) {
    const id = sourceId(ref)
    const existing = this.getSource(id)
    if (existing) return { added: false, source: existing }
    const totals = this.db.prepare('SELECT count(*) AS count, coalesce(sum(bytes),0) AS bytes FROM sources').get()
    if (totals.count >= MAX_FILES) throw new Error(`项目最多导入 ${MAX_FILES} 篇 PDF`)
    if (totals.bytes + ref.bytes > MAX_PROJECT_BYTES) throw new Error('项目 PDF 总量超出限制')
    this.db.prepare('INSERT INTO sources(id,name,bytes,status,added_at) VALUES(?,?,?,?,?)')
      .run(id, ref.name, ref.bytes, 'queued', new Date().toISOString())
    return { added: true, source: this.getSource(id) }
  }

  getSource(id) {
    return this.db.prepare('SELECT * FROM sources WHERE id=?').get(id) ?? null
  }

  listSources() {
    return this.db.prepare(`SELECT s.*, (SELECT count(*) FROM figures f WHERE f.source_id=s.id) AS figure_count
      FROM sources s ORDER BY s.added_at, s.name`).all()
  }

  importState(sendId) {
    return this.db.prepare('SELECT state FROM imports WHERE send_id=?').get(sendId)?.state ?? null
  }

  setImportState(sendId, state, error = null) {
    this.db.prepare(`INSERT INTO imports(send_id,state,error,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(send_id) DO UPDATE SET state=excluded.state,error=excluded.error,updated_at=excluded.updated_at`)
      .run(sendId, state, error, new Date().toISOString())
  }

  addImportError(sendId, name, error) {
    this.db.prepare(`INSERT INTO import_errors(send_id,name,error) VALUES(?,?,?)
      ON CONFLICT(send_id,name) DO UPDATE SET error=excluded.error`)
      .run(sendId, name.slice(0, 180), String(error).slice(0, 400))
  }

  importErrors() {
    return this.db.prepare('SELECT send_id AS sendId,name,error FROM import_errors ORDER BY send_id,name').all()
  }

  setSourceStatus(id, status, error = null) {
    this.db.prepare('UPDATE sources SET status=?,error=? WHERE id=?').run(status, error, id)
  }

  commitParsed(id, parsed) {
    if (!Number.isInteger(parsed.pageCount) || parsed.pageCount < 1
        || !Array.isArray(parsed.pages) || parsed.pages.length !== parsed.pageCount
        || !Array.isArray(parsed.figures)) {
      throw new Error('PDF 工作进程返回了无效的页面结构')
    }
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id=?)').run(id)
      this.db.prepare('DELETE FROM chunks WHERE source_id=?').run(id)
      this.db.prepare('DELETE FROM pages WHERE source_id=?').run(id)
      this.db.prepare('DELETE FROM figures WHERE source_id=?').run(id)
      const insertPage = this.db.prepare('INSERT INTO pages(source_id,page,text) VALUES(?,?,?)')
      const insertChunk = this.db.prepare('INSERT INTO chunks(id,source_id,page,part,text) VALUES(?,?,?,?,?)')
      const insertFts = this.db.prepare('INSERT INTO chunks_fts(chunk_id,text) VALUES(?,?)')
      for (const row of parsed.pages) {
        if (!Number.isInteger(row.page) || row.page < 1 || row.page > parsed.pageCount
            || typeof row.text !== 'string') throw new Error('PDF 页面编号或正文无效')
        insertPage.run(id, row.page, row.text)
        for (const [part, text] of splitPage(row.text).entries()) {
          const chunkId = `${id}:p${row.page}:c${part + 1}`
          insertChunk.run(chunkId, id, row.page, part + 1, text)
          insertFts.run(chunkId, text)
        }
      }
      const insertFigure = this.db.prepare(`INSERT INTO figures
        (id,source_id,page,caption,path,bbox,width,height,score) VALUES(?,?,?,?,?,?,?,?,?)`)
      for (const figure of parsed.figures) {
        if (!figure.id?.startsWith(`${id.slice(7)}:p${figure.page}:f`)
            || !/^figures\/[a-f0-9]{64}-p\d{3}-f\d{2}\.png$/.test(figure.path)
            || !Number.isInteger(figure.page) || figure.page < 1 || figure.page > parsed.pageCount) {
          throw new Error('PDF 图片来源或文件名无效')
        }
        insertFigure.run(figure.id, id, figure.page, figure.caption, figure.path,
          JSON.stringify(figure.bbox), figure.width, figure.height, figure.score)
      }
      this.db.prepare(`UPDATE sources SET title=?,doi=?,page_count=?,status='ready',error=NULL WHERE id=?`)
        .run(parsed.title || this.getSource(id).name, parsed.doi || null, parsed.pageCount, id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  search(query, limit = 8, sourceIds) {
    const expression = matchQuery(query)
    if (!expression) return []
    const count = Math.max(1, Math.min(Number(limit) || 8, 15))
    const scope = sourceIds ? ` AND c.source_id IN (${sourceIds.map(() => '?').join(',')})` : ''
    if (sourceIds && !sourceIds.length) return []
    return this.db.prepare(`SELECT c.id AS evidenceId,c.source_id AS sourceId,c.page,
        substr(c.text,1,1100) AS excerpt,s.name,s.title,bm25(chunks_fts) AS score
      FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.chunk_id
      JOIN sources s ON s.id=c.source_id
      WHERE chunks_fts MATCH ? AND s.status='ready'${scope}
      ORDER BY score LIMIT ?`).all(expression, ...(sourceIds || []), count)
  }

  evidence(id) {
    return this.db.prepare(`SELECT c.id AS evidenceId,c.source_id AS sourceId,c.page,
      c.text AS excerpt,s.name,s.title FROM chunks c JOIN sources s ON s.id=c.source_id
      WHERE c.id=? AND s.status='ready'`).get(id) ?? null
  }

  summaryContext(id) {
    const chunks = this.db.prepare('SELECT id,page,text FROM chunks WHERE source_id=? ORDER BY page,part').all(id)
    const selected = [...chunks.slice(0, 3), ...chunks.filter(row =>
      /\b(results?|conclusions?|discussion|abstract|performance)\b|结论|结果/iu.test(row.text.slice(0, 240)))
      .slice(0, 3), ...chunks.slice(-2)]
    const unique = [...new Map(selected.map(row => [row.id, row])).values()]
    return unique.slice(0, 8).map(row => ({ evidenceId: row.id, page: row.page,
      text: row.text.slice(0, 2600) }))
  }

  figures() {
    return this.db.prepare(`SELECT f.*,s.name,s.title FROM figures f
      JOIN sources s ON s.id=f.source_id WHERE s.status='ready' ORDER BY f.score DESC,f.page`).all()
      .map(row => ({ ...row, bbox: JSON.parse(row.bbox) }))
  }

  getSummary(source) {
    const row = this.db.prepare('SELECT data FROM paper_summaries WHERE source_id=?').get(source)
    return row ? JSON.parse(row.data) : null
  }

  putSummary(source, value) {
    this.db.prepare('INSERT INTO paper_summaries(source_id,data) VALUES(?,?) ON CONFLICT(source_id) DO UPDATE SET data=excluded.data')
      .run(source, JSON.stringify(value))
  }

  getTheme(batchHash) {
    const row = this.db.prepare('SELECT data FROM theme_batches WHERE batch_hash=?').get(batchHash)
    return row ? JSON.parse(row.data) : null
  }

  putTheme(batchHash, value) {
    this.db.prepare('INSERT INTO theme_batches(batch_hash,data) VALUES(?,?) ON CONFLICT(batch_hash) DO UPDATE SET data=excluded.data')
      .run(batchHash, JSON.stringify(value))
  }

  getOutline() {
    const row = this.db.prepare('SELECT revision,data,updated_at FROM outline WHERE id=1').get()
    return row ? { revision: row.revision, data: JSON.parse(row.data), updatedAt: row.updated_at } : null
  }

  saveOutline(value, expectedRevision) {
    const currentRevision = this.getOutline()?.revision ?? 0
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      throw new Error('大纲已被另一处修改，请刷新后重试')
    }
    const revision = currentRevision + 1
    const updatedAt = new Date().toISOString()
    this.db.prepare(`INSERT INTO outline(id,revision,data,updated_at) VALUES(1,?,?,?)
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at`)
      .run(revision, JSON.stringify(value), updatedAt)
    return { revision, data: value, updatedAt }
  }

  createJob(id, kind, phase) {
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO jobs(id,kind,state,phase,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(id, kind, 'running', phase, now, now)
    return this.getJob(id)
  }

  updateJob(id, state, phase, error = null) {
    this.db.prepare('UPDATE jobs SET state=?,phase=?,error=?,updated_at=? WHERE id=?')
      .run(state, phase, error, new Date().toISOString(), id)
    return this.getJob(id)
  }

  getJob(id) {
    return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) ?? null
  }

  listJobs() {
    return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 8').all()
  }

  latestJob() {
    return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1').get() ?? null
  }

  asset(promptHash) {
    return this.db.prepare('SELECT * FROM generated_assets WHERE prompt_hash=?').get(promptHash) ?? null
  }

  putAsset(promptHash, prompt, model, path, metadata) {
    this.db.prepare(`INSERT INTO generated_assets(prompt_hash,prompt,model,path,metadata)
      VALUES(?,?,?,?,?) ON CONFLICT(prompt_hash) DO UPDATE SET path=excluded.path,metadata=excluded.metadata`)
      .run(promptHash, prompt, model, path, JSON.stringify(metadata))
  }

  saveDeck(id, revision, path, manifestPath, promptHash = null) {
    this.db.prepare('INSERT INTO decks(id,outline_revision,path,manifest_path,prompt_hash,created_at) VALUES(?,?,?,?,?,?)')
      .run(id, revision, path, manifestPath, promptHash, new Date().toISOString())
  }

  deckByHash(hash) {
    return this.db.prepare('SELECT * FROM decks WHERE prompt_hash=? ORDER BY created_at DESC LIMIT 1')
      .get(hash) ?? null
  }

  getSlideDraft(hash, index) {
    const row = this.db.prepare('SELECT data FROM deck_slide_drafts WHERE prompt_hash=? AND slide_index=?')
      .get(hash, index)
    return row ? JSON.parse(row.data) : null
  }

  putSlideDraft(hash, index, data) {
    this.db.prepare(`INSERT INTO deck_slide_drafts(prompt_hash,slide_index,data) VALUES(?,?,?)
      ON CONFLICT(prompt_hash,slide_index) DO UPDATE SET data=excluded.data`)
      .run(hash, index, JSON.stringify(data))
  }

  saveDeckPdf(id, path) {
    this.db.prepare('UPDATE decks SET pdf_path=? WHERE id=?').run(path, id)
  }

  latestDeck() {
    return this.db.prepare('SELECT * FROM decks ORDER BY created_at DESC LIMIT 1').get() ?? null
  }

  deck(id) {
    return this.db.prepare('SELECT * FROM decks WHERE id=?').get(id) ?? null
  }

  saveReport(id, promptHash, data) {
    this.db.prepare('INSERT INTO reports(id,prompt_hash,data,created_at) VALUES(?,?,?,?)')
      .run(id, promptHash, JSON.stringify(data), new Date().toISOString())
    return this.report(id)
  }

  getExport(kind, id) {
    const row = this.db.prepare('SELECT data FROM workspace_exports WHERE kind=? AND artifact_id=?')
      .get(kind, id)
    return row ? JSON.parse(row.data) : null
  }

  saveExport(kind, id, data) {
    this.db.prepare(`INSERT INTO workspace_exports(kind,artifact_id,data) VALUES(?,?,?)
      ON CONFLICT(kind,artifact_id) DO UPDATE SET data=excluded.data`)
      .run(kind, id, JSON.stringify(data))
  }

  finishReport(id, docxPath, pdfPath, manifestPath) {
    this.db.prepare('UPDATE reports SET docx_path=?,pdf_path=?,manifest_path=? WHERE id=?')
      .run(docxPath, pdfPath, manifestPath, id)
    return this.report(id)
  }

  report(id) {
    const row = this.db.prepare('SELECT * FROM reports WHERE id=?').get(id)
    return row ? { ...row, data: JSON.parse(row.data) } : null
  }

  latestReport() {
    const row = this.db.prepare('SELECT id FROM reports ORDER BY created_at DESC LIMIT 1').get()
    return row ? this.report(row.id) : null
  }

  reportByHash(hash) {
    const row = this.db.prepare('SELECT id FROM reports WHERE prompt_hash=? ORDER BY created_at DESC LIMIT 1')
      .get(hash)
    return row ? this.report(row.id) : null
  }
}
