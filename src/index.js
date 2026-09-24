import { randomUUID } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { selectedSources } from './context.js'
import { writeDeck } from './deck.js'
import { buildDeckDraft, deckFingerprint } from './deck-draft.js'
import { writeDeckPdf } from './deck-pdf.js'
import { generateConceptImage } from './image.js'
import { importBatch, uploadedBatches } from './imports.js'
import { ingestAttachment } from './ingest.js'
import { buildOutline, searchWithRewrite, validateOutline } from './model.js'
import { buildReport, renderReport, reportFingerprint } from './report.js'
import { StudioStore } from './store.js'
import { StudioUploads } from './uploads.js'
import { publishArtifact } from './exports.js'
import { conceptPrompt } from './visuals.js'
import { editDocument, readDocument } from './editor.js'

export const name = 'dsh-notebook-studio'
export const inject = ['connection', 'sessions', 'sessionController', 'llm', 'tools', 'web']

// Serve the real package version to the Web client instead of hardcoding it there.
const VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version }
  catch { return null }
})()

function failure(error) {
  return { ok: false, error: { code: 'studio/error',
    message: String(error?.message || error).slice(0, 500), details: {} } }
}

function publicDeck(deck, store) {
  return deck ? { id: deck.id, outlineRevision: deck.outline_revision,
    outputDirectory: store?.getExport('deck', deck.id)?.directory || null,
    hasPdf: !!deck.pdf_path, createdAt: deck.created_at } : null
}

function publicReport(report, store) {
  return report ? { id: report.id, title: report.data.title,
    outputDirectory: store?.getExport('report', report.id)?.directory || null,
    sourceCount: report.data.sourceIds?.length ?? null,
    webSources: (report.data.webSources || []).map(({ id, title, url, searchedAt }) =>
      ({ id, title, url, searchedAt })),
    ready: !!report.docx_path && !!report.pdf_path, createdAt: report.created_at } : null
}

export function createStudioService(ctx, config = {}) {
  const stores = new Map()
  const uploads = new StudioUploads()
  const active = new Map()
  const imports = new Set()
  const importTails = new Map()
  const pending = new Set()
  const controllers = new Set()
  const coldSessions = new Map()
  const observedSeq = new Map()

  async function session(id) {
    if (typeof id !== 'string' || !id || id.length > 256) throw new Error('会话 ID 无效')
    const current = ctx.sessions.get(id)
    if (current) return current
    // 查看历史会话时，Web UI 可以展示冷数据而不激活 Agent；用只读快照做所有权校验。
    if (!coldSessions.has(id)) {
      const loading = ctx.sessionController.inspect(id).then(inspection =>
        ({ id, header: inspection.meta, snapshotEvents: () => inspection.events }))
        .catch(error => {
          coldSessions.delete(id)
          throw error
        })
      coldSessions.set(id, loading)
    }
    return coldSessions.get(id)
  }

  function storeFor(id) {
    if (!stores.has(id)) stores.set(id, new StudioStore(id, config.dataRoot))
    return stores.get(id)
  }

  function startJob(store, kind, phase, work, key = `${store.sessionId}:${kind}`) {
    if (active.has(key)) return store.getJob(active.get(key))
    const job = store.createJob(randomUUID(), kind, phase)
    const controller = new AbortController()
    controllers.add(controller)
    active.set(key, job.id)
    const progress = value => store.updateJob(job.id, 'running', value)
    const promise = Promise.resolve().then(() => work(progress, controller.signal))
      .then(result => store.updateJob(job.id, 'succeeded', result?.warning
        ? `完成（${String(result.warning).slice(0, 180)}）` : '完成'))
      .catch(error => store.updateJob(job.id, controller.signal.aborted ? 'interrupted' : 'failed',
        store.getJob(job.id)?.phase || phase, String(error?.message || error).slice(0, 500)))
      .finally(() => {
        active.delete(key)
        controllers.delete(controller)
        pending.delete(promise)
      })
    pending.add(promise)
    return job
  }

  function enqueueImport(current, claimedRoot) {
    const id = String(current.id)
    const key = `${id}:${claimedRoot}`
    if (imports.has(key)) return
    const store = storeFor(id)
    const sendId = basename(claimedRoot)
    if (store.importState(sendId) === 'complete' || store.importState(sendId) === 'failed') return
    imports.add(key)
    const previous = importTails.get(id) || Promise.resolve()
    const run = previous.catch(() => {}).then(async () => {
      const job = startJob(store, 'import', '校验附件', async (progress, signal) => {
        try {
          await importBatch(store, current, claimedRoot, progress, signal)
        } catch (error) {
          store.setImportState(sendId, signal.aborted ? 'pending' : 'failed', error.message)
          store.addImportError(sendId, '清单', error.message)
          throw error
        }
      }, key)
      // 导入按会话顺序执行，不能让后一批越过前一批。
      while (active.get(key) === job.id) await new Promise(resolve => setTimeout(resolve, 250))
    }).finally(() => {
      imports.delete(key)
      if (importTails.get(id) === run) importTails.delete(id)
    })
    importTails.set(id, run)
  }

  function reconcile(current, event) {
    const id = String(current.id)
    const events = event ? [event] : current.snapshotEvents()
    const last = observedSeq.get(id) ?? -1
    for (const item of events) {
      if (typeof item.seq === 'number' && item.seq <= last) continue
      for (const root of uploadedBatches(item)) {
      enqueueImport(current, root)
      }
    }
    const newest = events.at(-1)?.seq
    if (typeof newest === 'number') observedSeq.set(id, Math.max(last, newest))
  }

  function forgetSession(id) {
    coldSessions.delete(String(id))
    observedSeq.delete(String(id))
  }

  function generationKey(store) { return `${store.sessionId}:composition` }

  async function publishResult(store, kind, result) {
    try {
      await publishArtifact(store, await session(store.sessionId), kind, result)
      return result
    } catch (error) {
      return { ...result, warning: [result.warning, `工作区保存失败：${error.message}`].filter(Boolean).join('；') }
    }
  }

  async function renderReportOutput(store, report, settings, signal, progress) {
    return publishResult(store, 'report', await renderReport(store, report, settings, signal, progress))
  }

  function assertIdle(store) {
    if (active.has(generationKey(store))) throw new Error('另一个成稿任务正在执行，请等待完成')
  }

  function requestedSources(store, input) {
    if (input.includeWeb !== undefined && typeof input.includeWeb !== 'boolean') {
      throw new Error('联网选项无效')
    }
    return { sourceIds: selectedSources(store, input.sourceIds).map(source => source.id),
      includeWeb: input.includeWeb === true }
  }

  async function render(store, progress, signal, record = store.getOutline(), editedData = null) {
    if (!record) throw new Error('请先生成并审核大纲')
    const settings = store.getSettings()
    const draft = editedData ? { data: structuredClone(editedData) }
      : await buildDeckDraft(ctx, store, record, settings, signal, progress)
    const full = { ...record, data: draft.data }
    const image = settings.image
    const generated = new Map()
    const indexes = full.data.slides.map((slide, index) => slide.visualKind === 'generated' ? index : -1)
      .filter(index => index >= 0)
    let imageFailure = image.enabled ? null : '未启用图片模型'
    for (const [offset, index] of indexes.entries()) {
      const item = full.data.slides[index]
      if (!imageFailure) {
        progress(`概念示意图 ${offset + 1}/${indexes.length}（每次一张）`)
        try {
          const asset = await generateConceptImage(store, conceptPrompt(item, item.visualPrompt), image, { signal })
          generated.set(index, { ...asset, model: image.model })
          continue
        } catch (error) {
          signal.throwIfAborted()
          imageFailure = String(error?.message || error)
        }
      }
      // 可选示意图失败不应使已有的文献证据和逐页成稿作废。
      item.visualKind = 'flow'
      if (!item.flowNodes.length) item.flowNodes = [item.title,
        ...item.points.map(point => point.text.slice(0, 38))].slice(0, 4)
    }
    signal.throwIfAborted()
    progress('排版并导出 PPTX/PDF')
    const warning = indexes.length && imageFailure
      ? `图片模型不可用：${imageFailure}；未生成的 AI 图已改为流程图` : null
    const deck = await writeDeck(store, full, generated,
      { promptHash: warning ? undefined : draft.hash })
    await writeDeckPdf(store, full, generated, deck)
    return publishResult(store, 'deck', { ...store.deck(deck.id), ...(warning ? { warning } : {}) })
  }

  async function handle(endpoint, input = {}) {
    try {
      const current = await session(input.sessionId)
      const store = storeFor(String(current.id))
      reconcile(current)
      switch (endpoint) {
        case 'listSources': {
          const warnings = []
          if (!active.has(generationKey(store))) {
            for (const [kind, item] of [['report', store.latestReport()], ['deck', store.latestDeck()]]) {
              if (!item?.pdf_path) continue
              const result = await publishResult(store, kind, item)
              if (result.warning) warnings.push(result.warning)
            }
          }
          return { ok: true, value: {
          projectTitle: current.header?.title || basename(current.header?.cwd || '') || '当前会话文献项目',
          projectPath: current.header?.cwd || '',
          version: VERSION,
          sources: store.listSources(), importErrors: store.importErrors(), jobs: store.listJobs(),
          outline: store.getOutline(), deck: publicDeck(store.latestDeck(), store),
          report: publicReport(store.latestReport(), store), outputWarning: warnings.join('；'),
        } } }
        case 'listModels': {
          if (!ctx.llm?.listProviders) throw new Error('dsh 模型目录尚不可用')
          const providers = ctx.llm.listProviders()
          const models = await Promise.all(providers.map(async provider => ({
            id: provider.id, name: provider.name || provider.id,
            models: (await ctx.llm.listModels(provider.id).catch(() => []))
              .filter(model => !model.inputModalities || model.inputModalities.includes('text'))
              .map(model => ({ id: model.id, name: model.name || model.id })),
          })))
          return { ok: true, value: models }
        }
        case 'getSettings': return { ok: true, value: store.publicSettings() }
        case 'saveSettings': {
          if ([...active.keys()].some(key => key.startsWith(`${store.sessionId}:`))) {
            throw new Error('当前项目有后台任务，请完成后再修改模型')
          }
          return { ok: true, value: store.saveSettings(input.settings) }
        }
        case 'uploadStart': return { ok: true,
          value: await uploads.start(store, input.name, input.bytes) }
        case 'uploadChunk': return { ok: true, value: await uploads.chunk(store,
          input.uploadId, input.offset, input.data) }
        case 'uploadCancel': await uploads.cancel(store, input.uploadId)
          return { ok: true, value: null }
        case 'uploadFinish': {
          const result = await uploads.finish(store, input.uploadId)
          if (result.added) {
            startJob(store, 'import', `解析 ${result.ref.name}`, (_, signal) =>
              ingestAttachment(store, result.ref, result.path, { signal }),
            `${store.sessionId}:upload:${result.ref.attachmentId}`)
          }
          return { ok: true, value: { added: result.added, source: result.source } }
        }
        case 'getJob': return { ok: true, value: input.jobId
          ? store.getJob(input.jobId) : store.latestJob() }
        case 'search': {
          if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 300) {
            throw new Error('检索问题应为 1–300 个字符')
          }
          return { ok: true, value: await searchWithRewrite(ctx, store, input.query,
            store.getSettings().text) }
        }
        case 'generateOutline': {
          assertIdle(store)
          const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
          if (prompt.length > 1200) throw new Error('写作提示词不能超过 1200 字')
          const options = requestedSources(store, input)
          const settings = store.getSettings()
          const job = startJob(store, 'outline', '准备文献摘要', (progress, signal) =>
            buildOutline(ctx, store, { ...settings.text, imageEnabled: settings.image.enabled },
              signal, progress, prompt, options), generationKey(store))
          return { ok: true, value: job }
        }
        case 'saveOutline': {
          assertIdle(store)
          if (!Number.isSafeInteger(input.revision)) throw new Error('请提供当前大纲版本')
          const original = store.getOutline()
          if (!original) throw new Error('大纲不存在')
          const next = { ...input.outline, sourceIds: original.data.sourceIds,
            webSources: original.data.webSources, prompt: original.data.prompt }
          return { ok: true, value: store.saveOutline(validateOutline(store, next), input.revision) }
        }
        case 'renderDeck': {
          assertIdle(store)
          if (input.format !== undefined && !['pptx', 'pdf'].includes(input.format)) {
            throw new Error('演示文稿格式只能选择 PPTX 或 PDF')
          }
          const record = store.getOutline()
          if (!record) throw new Error('请先生成大纲')
          if (input.revision !== record.revision) throw new Error('大纲已修改，请刷新后再导出')
          const hash = deckFingerprint(record, store.getSettings())
          const old = store.deckByHash(hash)
          if (old?.pdf_path) {
            try {
              await Promise.all([stat(old.path), stat(old.pdf_path)])
              await publishResult(store, 'deck', old)
              return { ok: true, value: { deck: publicDeck(old, store), reused: true } }
            } catch { /* 文件丢失则重新导出。 */ }
          }
          const job = startJob(store, 'render', '逐页综合 PDF 证据', (progress, signal) =>
            render(store, progress, signal, record), generationKey(store))
          return { ok: true, value: { job } }
        }
        case 'generateDeck': {
          assertIdle(store)
          const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
          if (!prompt || prompt.length > 1200) throw new Error('演示文稿提示词应为 1–1200 个字符')
          if (input.format !== undefined && !['pptx', 'pdf'].includes(input.format)) {
            throw new Error('演示文稿格式只能选择 PPTX 或 PDF')
          }
          const options = requestedSources(store, input)
          const settings = store.getSettings()
          const job = startJob(store, 'deck', '准备所选 PDF 与联网背景', async (progress, signal) => {
            const record = await buildOutline(ctx, store,
              { ...settings.text, imageEnabled: settings.image.enabled },
              signal, progress, prompt, options)
            return render(store, progress, signal, record)
          }, generationKey(store))
          return { ok: true, value: { job } }
        }
        case 'generateReport': {
          assertIdle(store)
          const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
          if (!prompt || prompt.length > 1200) throw new Error('报告提示词应为 1–1200 个字符')
          if (input.format !== undefined && !['docx', 'pdf'].includes(input.format)) {
            throw new Error('报告格式只能选择 DOCX 或 PDF')
          }
          const options = requestedSources(store, input)
          const settings = store.getSettings()
          const hash = options.includeWeb ? null : reportFingerprint(store, settings, prompt, options)
          const old = hash ? store.reportByHash(hash) : null
          if (old?.docx_path && old?.pdf_path) {
            try {
              await Promise.all([stat(old.docx_path), stat(old.pdf_path)])
              await publishResult(store, 'report', old)
              return { ok: true, value: { report: publicReport(old, store), reused: true } }
            } catch { /* 丢失导出文件后重新排版。 */ }
          }
          const job = startJob(store, 'report', '准备报告证据', async (progress, signal) => {
            const draft = old || await buildReport(ctx, store, settings, prompt, signal, progress, options)
            return renderReportOutput(store, draft, settings, signal, progress)
          }, generationKey(store))
          return { ok: true, value: { job } }
        }
        case 'renderReport': {
          assertIdle(store)
          const report = store.report(input.reportId)
          if (!report) throw new Error('报告不存在')
          const settings = store.getSettings()
          const job = startJob(store, 'report', '重新排版报告', (progress, signal) =>
            renderReportOutput(store, report, settings, signal, progress), generationKey(store))
          return { ok: true, value: { job } }
        }
        case 'getDocument': return { ok: true,
          value: await readDocument(store, input.kind, input.id) }
        case 'saveDocument': {
          assertIdle(store)
          const original = await readDocument(store, input.kind, input.id)
          // 文件读取期间可能启动其他任务；写入前再次检查，拒绝过期编辑覆盖新稿。
          assertIdle(store)
          const latest = input.kind === 'report' ? store.latestReport() : store.latestDeck()
          if (latest?.id !== input.id) throw new Error('已有更新的成稿，请重新打开后再编辑')
          const data = editDocument(store, original, input.data)
          const settings = store.getSettings()
          const record = input.kind === 'report'
            ? store.saveReport(randomUUID(), `edited:${randomUUID()}`, data)
            : { revision: store.deck(input.id).outline_revision, data }
          const job = startJob(store, input.kind, '保存编辑并重新排版', (progress, signal) =>
            input.kind === 'report'
              ? renderReportOutput(store, record, settings, signal, progress)
              : render(store, progress, signal, record, data), generationKey(store))
          return { ok: true, value: { job } }
        }
        case 'retrySource': {
          const source = store.getSource(input.sourceId)
          if (!source || !['error', 'queued'].includes(source.status)) throw new Error('该文献无法重试')
          const path = join(store.directory, 'sources', `${source.id.slice(7)}.pdf`)
          await stat(path)
          const job = startJob(store, 'retry', `重试 ${source.name}`, (_, signal) =>
            ingestAttachment(store, { attachmentId: source.id, bytes: source.bytes, name: source.name },
              path, { signal }), `${store.sessionId}:retry:${source.id}`)
          return { ok: true, value: job }
        }
        case 'downloadDeck': {
          const deck = store.deck(input.deckId)
          if (!deck) throw new Error('该会话没有指定的 PPTX')
          return { ok: true, value: {
            deck: publicDeck(deck, store),
            previewUrl: deck.pdf_path
              ? `/api/studio/deck-pdf?sessionId=${encodeURIComponent(store.sessionId)}&deckId=${deck.id}&preview=1` : null,
            pptxUrl: `/api/studio/deck?sessionId=${encodeURIComponent(store.sessionId)}&deckId=${deck.id}`,
            pdfUrl: deck.pdf_path
              ? `/api/studio/deck-pdf?sessionId=${encodeURIComponent(store.sessionId)}&deckId=${deck.id}` : null,
            manifestUrl: `/api/studio/manifest?sessionId=${encodeURIComponent(store.sessionId)}&deckId=${deck.id}`,
          } }
        }
        case 'downloadReport': {
          const report = store.report(input.reportId)
          if (!report?.docx_path || !report.pdf_path) throw new Error('报告尚未完成导出')
          const query = `sessionId=${encodeURIComponent(store.sessionId)}&reportId=${report.id}`
          return { ok: true, value: { report: publicReport(report, store),
            previewUrl: `/api/studio/report-pdf?${query}&preview=1`,
            docxUrl: `/api/studio/report-docx?${query}`,
            pdfUrl: `/api/studio/report-pdf?${query}`,
            manifestUrl: `/api/studio/report-manifest?${query}` } }
        }
        default: throw new Error('未知的 Studio 操作')
      }
    } catch (error) {
      return failure(error)
    }
  }

  async function download(request, kind) {
    try {
      const params = new URL(request.url).searchParams
      const reportFile = kind.startsWith('report-')
      const id = params.get(reportFile ? 'reportId' : 'deckId')
      if (!/^[0-9a-f-]{36}$/.test(id || '')) throw new Error('无效的文件 ID')
      const sessionId = params.get('sessionId')
      await session(sessionId)
      const store = storeFor(sessionId)
      const item = reportFile ? store.report(id) : store.deck(id)
      if (!item) return new Response('not found', { status: 404 })
      const key = { deck: 'path', 'deck-pdf': 'pdf_path', manifest: 'manifest_path',
        'report-docx': 'docx_path', 'report-pdf': 'pdf_path',
        'report-manifest': 'manifest_path' }[kind]
      const path = item[key]
      if (!path) return new Response('not found', { status: 404 })
      const info = await stat(path)
      if (!info.isFile() || !info.size) throw new Error('成稿文件为空或不可用，请重新排版后下载')
      const extension = { deck: 'pptx', 'deck-pdf': 'pdf', manifest: 'sources.json',
        'report-docx': 'docx', 'report-pdf': 'pdf',
        'report-manifest': 'sources.json' }[kind]
      return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(path)), { headers: {
        'content-type': kind === 'deck' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          : kind === 'report-docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : extension === 'pdf' ? 'application/pdf' : 'application/json; charset=utf-8',
        'content-length': String(info.size),
        'content-disposition': `${extension === 'pdf' && params.get('preview') === '1' ? 'inline' : 'attachment'}; filename="studio-${id}.${extension}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      } })
    } catch (error) {
      return new Response(error.message, { status: 400 })
    }
  }

  async function shutdown() {
    for (const controller of controllers) controller.abort()
    await Promise.allSettled([...pending, ...importTails.values()])
    await uploads.close()
    for (const store of stores.values()) store.close()
  }

  return { handle, download, reconcile, forgetSession, shutdown, storeFor }
}

export function apply(ctx, config = {}) {
  const studio = createStudioService(ctx, config)
  ctx.connection.rpc.handle('/studio', (endpoint, payload) => studio.handle(endpoint, payload))
  for (const kind of ['deck', 'manifest', 'deck-pdf', 'report-docx', 'report-pdf', 'report-manifest']) {
    // dsh 必须显式声明无请求体的读取模式，否则 GET 会被当作带流请求而返回空的 400。
    ctx.connection.fetch.register({ path: `/api/studio/${kind}`, methods: ['GET', 'HEAD'], requestBody: 'buffered',
      fetch: request => studio.download(request, kind) })
  }
  ctx.on('session/event', (session, event) => studio.reconcile(session, event), { global: true })
  ctx.on('session/disposed', session => studio.forgetSession(session.id), { global: true })
  for (const session of ctx.sessions.list()) studio.reconcile(session)
  ctx.tools.register(defineTool({
    name: 'studio_search',
    description: '检索当前会话 Notebook Studio 中已导入的 PDF。每条结果包含文献名、PDF 页码、证据 ID 与原文摘录；证据不足时不要猜测。',
    parameters: { query: { type: 'string', required: true, description: '中文或英文的简短学术检索问题' } },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, execution) {
      if (!execution.agent) throw new Error('必须从当前会话调用文献检索')
      const store = studio.storeFor(String(execution.agent.session.id))
      if (typeof args.query !== 'string' || args.query.length > 300) throw new Error('检索问题无效')
      const rows = await searchWithRewrite(ctx, store, args.query,
        store.getSettings().text, execution.signal)
      return { results: rows, guidance: rows.length ? '回答请引用 evidenceId、文献名和 PDF 页码。'
        : '没有匹配的证据；请说明证据不足，或换用更具体的中英文检索词。' }
    },
  }))
  ctx.effect(() => () => studio.shutdown(), 'Notebook Studio：停止后台任务并关闭数据库')
}
