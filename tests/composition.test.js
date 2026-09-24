import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import JSZip from 'jszip'
import { buildDeckDraft } from '../src/deck-draft.js'
import { editDocument, readDocument } from '../src/editor.js'
import { writeDeck } from '../src/deck.js'
import { writeDeckPdf } from '../src/deck-pdf.js'
import { createStudioService } from '../src/index.js'
import { buildOutline, validateOutline } from '../src/model.js'
import { buildReport, renderReport, validateReport } from '../src/report.js'
import { StudioStore } from '../src/store.js'

const PROMPT = '比较蛋白质设计方法的证据与局限'


test('旧版演示从导出清单恢复正文，不读取后来修改的大纲', async () => {
  const { store, ids } = await fixture()
  const { ctx } = fakeContext()
  const settings = store.getSettings()
  try {
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, { sourceIds: [ids[0]] })
    const draft = await buildDeckDraft(ctx, store, outline, settings)
    const deck = await writeDeck(store, { ...outline, data: draft.data }, new Map())
    const manifest = JSON.parse(await readFile(deck.manifest_path, 'utf8'))
    assert.equal(manifest.version, 3)
    assert.deepEqual(manifest.content, draft.data)
    delete manifest.content
    manifest.version = 2
    await writeFile(deck.manifest_path, JSON.stringify(manifest))
    const later = structuredClone(outline.data)
    later.slides[1].points[0].text = '后来修改的大纲，不是原先正文'
    store.saveOutline(later, outline.revision)
    const document = await readDocument(store, 'deck', deck.id)
    assert.match(document.data.slides[1].takeaway.text, /详细成稿/)
    assert.notEqual(document.data.slides[1].points[0].text, later.slides[1].points[0].text)
    const edited = structuredClone(document.data)
    edited.slides[1].points[0].text = ''
    assert.throws(() => editDocument(store, document, edited), /幻灯片论述/)
    await assert.rejects(readDocument(store, 'file', '/etc/passwd'), /类型无效/)
    await assert.rejects(readDocument(store, 'deck', 'unknown'), /当前会话/)
  } finally { store.close() }
})

test('正文编辑 RPC 保留引用、拒绝过期版本，重新导出不调用文本模型或覆盖旧稿', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-editor-'))
  const { ctx, calls } = fakeContext()
  ctx.sessions = { get: id => ['owner', 'other'].includes(id)
    ? { id, header: { cwd: root, title: '编辑验收项目' }, snapshotEvents: () => [] } : null }
  const studio = createStudioService(ctx, { dataRoot: root })
  const store = studio.storeFor('owner')
  const sourceId = 'sha256:' + '1'.padStart(64, '0')
  store.addSource({ attachmentId: sourceId, bytes: 100, name: 'selected.pdf' })
  store.commitParsed(sourceId, { pageCount: 1, title: 'Selected Paper', figures: [],
    pages: [{ page: 1, text: 'Protein design methods and limitations. '.repeat(80) }] })
  const wait = async jobId => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const job = store.getJob(jobId)
      if (job.state !== 'running') { assert.equal(job.state, 'succeeded', job.error); return }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error('编辑排版超时')
  }
  try {
    // 语言词典与会话无关：客户端进入工作台前即可取用。
    const messages = await studio.handle('getMessages', {})
    assert.equal(messages.ok, true)
    assert.equal(typeof messages.value.en, 'object')
    const snapshot = (await studio.handle('listSources', { sessionId: 'owner' })).value
    assert.equal(snapshot.projectTitle, '编辑验收项目')
    // The Web client renders the version label from this field instead of hardcoding it.
    assert.equal(snapshot.version, JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version)
    assert.equal(typeof snapshot.workspacePath, 'string')
    assert.equal(typeof snapshot.workspaceName, 'string')
    for (const kind of ['deck', 'report']) {
      const started = await studio.handle(kind === 'deck' ? 'generateDeck' : 'generateReport',
        { sessionId: 'owner', prompt: PROMPT, sourceIds: [sourceId] })
      assert.equal(started.ok, true)
      await wait(started.value.job.id)
      const original = kind === 'deck' ? store.latestDeck() : store.latestReport()
      const path = kind === 'deck' ? original.path : original.docx_path
      const originalBytes = await readFile(path)
      const loaded = await studio.handle('getDocument', { sessionId: 'owner', kind, id: original.id })
      assert.equal(loaded.ok, true)
      assert.equal((await studio.handle('getDocument', { sessionId: 'other', kind, id: original.id })).ok, false)
      const data = structuredClone(loaded.value.data)
      data.title = '用户修订后的成稿标题'
      data.sourceIds = ['forged-source']
      data.webSources = [{ id: 'W99', url: 'https://forged.example.org' }]
      if (kind === 'deck') {
        data.slides[1].points[0].text = '人工核对后的演示正文'
        data.slides[1].points[0].evidenceIds = ['forged-evidence']
        data.slides[1].figureId = 'forged-figure'
        data.slides[1].visualKind = 'paper'
        data.slides[1].speakerNotes = '用户更新的讲者备注'
      } else {
        data.sections[0].paragraphs[0].text = '人工核对后的报告正文'
        data.sections[0].paragraphs[0].evidenceIds = ['forged-evidence']
        data.sections[0].visuals = [{ type: 'generated', prompt: 'forged-prompt' }]
        data.tableRows[0].finding = '修订后的表格结论'
      }
      const tooLong = structuredClone(data)
      tooLong.title = '字'.repeat(141)
      assert.equal((await studio.handle('saveDocument', { sessionId: 'owner', kind, id: original.id, data: tooLong })).ok, false)
      const modelCalls = calls.model.length
      const saved = await studio.handle('saveDocument', { sessionId: 'owner', kind, id: original.id, data })
      assert.equal(saved.ok, true, saved.error?.message)
      await wait(saved.value.job.id)
      assert.equal(calls.model.length, modelCalls, '保存正文不能重新调用文本模型')
      const latest = kind === 'deck' ? store.latestDeck() : store.latestReport()
      assert.notEqual(latest.id, original.id)
      const updated = (await studio.handle('getDocument', { sessionId: 'owner', kind, id: latest.id })).value.data
      assert.deepEqual(updated.sourceIds, loaded.value.data.sourceIds)
      assert.deepEqual(updated.webSources, loaded.value.data.webSources)
      if (kind === 'deck') {
        assert.deepEqual(updated.slides[1].points[0].evidenceIds, loaded.value.data.slides[1].points[0].evidenceIds)
        assert.equal(updated.slides[1].visualKind, loaded.value.data.slides[1].visualKind)
        assert.equal(updated.slides[1].figureId, loaded.value.data.slides[1].figureId)
      } else {
        assert.deepEqual(updated.sections[0].paragraphs[0].evidenceIds, loaded.value.data.sections[0].paragraphs[0].evidenceIds)
        assert.deepEqual(updated.sections[0].visuals, loaded.value.data.sections[0].visuals)
      }
      const office = await JSZip.loadAsync(await readFile(kind === 'deck' ? latest.path : latest.docx_path))
      const xml = await office.file(kind === 'deck' ? 'ppt/slides/slide2.xml' : 'word/document.xml').async('string')
      assert.match(xml, kind === 'deck' ? /人工核对后的演示正文/ : /人工核对后的报告正文/)
      assert.match(pdfText(latest.pdf_path), kind === 'deck' ? /人工核对后的演示正文/ : /人工核对后的报告正文/)
      assert.deepEqual(await readFile(path), originalBytes)
      const stale = await studio.handle('saveDocument', { sessionId: 'owner', kind, id: original.id, data })
      assert.equal(stale.ok, false)
      assert.match(stale.error.message, /更新的成稿/)
      assert.equal((await studio.handle('saveDocument', { sessionId: 'other', kind, id: latest.id, data })).ok, false)
      assert.notEqual(store.getExport(kind, latest.id).directory, store.getExport(kind, original.id).directory)
    }
  } finally { await studio.shutdown() }
})


function pdfText(path) {
  const result = spawnSync(join(process.cwd(), '.venv', 'bin', 'python'), ['-c',
    'import pymupdf,sys; doc=pymupdf.open(sys.argv[1]); print("".join(page.get_text() for page in doc))', path],
  { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

async function fixture(count = 2) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-composition-'))
  const store = new StudioStore('selected-session', root)
  const ids = []
  for (let index = 1; index <= count; index++) {
    const id = `sha256:${index.toString(16).padStart(64, '0')}`
    ids.push(id)
    store.addSource({ attachmentId: id, bytes: 100, name: `paper-${index}.pdf` })
    store.commitParsed(id, { pageCount: 1, title: index === 1 ? 'Selected Paper'
      : index === 2 ? 'Excluded Paper' : `Paper ${index}`,
      pages: [{ page: 1, text: (index === 1
        ? 'Protein design methods, validation and limitations. '
        : index === 2 ? 'EXCLUDED_SECRET_DATA unrelated private findings. '
          : `Paper ${index} covers protein design methods and limitations. `).repeat(80) }], figures: [] })
  }
  return { store, ids }
}

function fakeContext({ invalidDraft = false, failWeb = false, manyWeb = false,
  imageVisuals = false, overlongTakeaway = false, missingTakeawayRef = false } = {}) {
  const calls = { model: [], web: [] }
  const ctx = { web: { async search(request) {
    calls.web.push(request)
    if (failWeb) throw new Error('联网提供方失败')
    return { sources: [
      { url: 'https://example.org/background', title: '独立背景材料',
        snippet: 'Protein design has multiple approaches.' },
      ...(manyWeb ? Array.from({ length: 5 }, (_, index) => ({
        url: `https://example.org/background-${index + 2}`, title: `补充背景 ${index + 2}`,
        snippet: 'Additional methodological background.' })) : []),
      { url: 'https://example.org/background', title: '重复网址', snippet: '重复' },
      { url: 'https://localhost/unsafe', title: '内网', snippet: '不得保留' },
      { url: 'https://example.org/no-snippet', title: '无摘录' },
    ] }
  } }, llm: { async *stream(options) {
    const prompt = options.messages[0].content[0].text
    calls.model.push(prompt)
    let answer
    if (prompt.includes('文献：')) answer = {
      summary: '验证蛋白质设计方法', claims: [{ text: '方法有一定局限', refs: ['E1'] }],
    }
    else if (prompt.includes('合并成')) answer = { themes: [{ text: '比较方法和验证限制', refs: ['C1'] }] }
    else if (prompt.includes('制作中文')) {
      const [, first, last] = prompt.match(/本次只生成第 (\d+)–(\d+) 页/)
      answer = { title: '蛋白质设计综述',
        slides: Array.from({ length: last - first + 1 }, (_, offset) => {
          const index = Number(first) - 1 + offset
          return { title: `主题 ${index + 1}`,
            points: index ? [{ text: '需要审阅的研究方法', refs: ['R1'],
              webRefs: prompt.includes('W1') ? ['W1'] : [] }] : [],
            visualKind: 'flow', flowNodes: ['问题', '验证', '局限'] }
        }) }
    }
    else if (prompt.includes('请写一页真正可演讲的成稿')) answer = {
      takeaway: { text: overlongTakeaway && prompt.includes('本页是第 6/14 页') && !prompt.includes('校验反馈')
        ? '结'.repeat(121) : '详细成稿的核心结论：方法有证据但仍有局限',
        refs: missingTakeawayRef && prompt.includes('本页是第 6/14 页') && !prompt.includes('校验反馈')
          ? [] : [invalidDraft ? 'E999' : 'E1'], webRefs: prompt.includes('W1') ? ['W1'] : [] },
      points: [
        { text: '逐页 PDF 显示方法需要经过验证，不能只凭大纲判断可靠性。',
          refs: ['E1'], webRefs: [] },
        { text: '证据也显示结果存在适用条件，应该区分已报道发现和推测。',
          refs: ['E1'], webRefs: prompt.includes('W1') ? ['W1'] : [] },
      ],
      speakerNotes: '首先说明本文献在 PDF 原文中所报告的方法和验证范围。随后对照该页的两条证据，解释适用条件、不同研究的局限，明确哪些内容不能从已有资料推导。',
      visual: imageVisuals ? { type: 'generated', caption: '方法概念示意', prompt: 'Study concepts' } : undefined,
    }
    else if (prompt.includes('生成中文学术报告')) answer = {
      title: '蛋白质设计图文报告',
      overview: [{ text: '用文献证据比较研究方法和局限。', refs: ['R1'],
        webRefs: prompt.includes('W1') ? ['W1'] : [] }],
      sections: Array.from({ length: 4 }, (_, index) => ({ title: `分析 ${index + 1}`,
        paragraphs: [{ text: `第 ${index + 1} 节根据所选 PDF 的证据分析方法及限制。`,
          refs: ['R1'], webRefs: prompt.includes('W1') ? ['W1'] : [] }],
        visuals: imageVisuals ? [{ type: 'generated', caption: `方法概念 ${index + 1}`, prompt: 'Study concepts' }] : undefined })),
    }
    else answer = 'protein design'
    yield { type: 'text-delta', index: 0, text: JSON.stringify(answer) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } }
  return { ctx, calls }
}

test('选篇与联网显式隔离：PDF 页码和 W 编号分别校验', async () => {
  const { store, ids } = await fixture()
  const { ctx, calls } = fakeContext()
  const settings = store.getSettings()
  try {
    const options = { sourceIds: [ids[0]], includeWeb: true }
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, options)
    assert.equal(calls.web.length, 1)
    assert.equal(calls.web[0].query, PROMPT)
    assert.ok(!calls.web[0].query.includes('EXCLUDED_SECRET_DATA'))
    assert.deepEqual(outline.data.sourceIds, [ids[0]])
    assert.deepEqual(outline.data.webSources.map(row => row.id), ['W1'])
    assert.equal(store.getSummary(ids[1]), null)
    assert.ok(!calls.model.join('\n').includes('EXCLUDED_SECRET_DATA'))
    const invalid = structuredClone(outline.data)
    invalid.slides[1].points[0].webIds = ['W99']
    assert.throws(() => validateOutline(store, invalid), /网络引用/)
    invalid.slides[1].points[0].webIds = []
    invalid.slides[1].points[0].evidenceIds = [store.summaryContext(ids[1])[0].evidenceId]
    assert.throws(() => validateOutline(store, invalid), /页码依据/)
    await assert.rejects(buildOutline(ctx, store, settings.text, undefined, () => {}, PROMPT,
      { sourceIds: ['sha256:' + 'f'.repeat(64)] }), /所选 PDF/)
    const noWeb = await buildReport(ctx, store, settings, PROMPT, undefined, () => {},
      { sourceIds: [ids[0]], includeWeb: false })
    assert.deepEqual(noWeb.data.webSources, [])
    assert.equal(calls.web.length, 1)
    const invalidReport = structuredClone(noWeb.data)
    invalidReport.overview[0].webIds = ['W99']
    assert.throws(() => validateReport(store, invalidReport), /网络引用/)
  } finally { store.close() }
})

test('详细演示成稿使用逐页摘录；PPTX/PDF 和报告分别保留网络出处与选篇', async () => {
  const { store, ids } = await fixture()
  const { ctx, calls } = fakeContext()
  const settings = store.getSettings()
  const options = { sourceIds: [ids[0]], includeWeb: true }
  try {
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, options)
    const draft = await buildDeckDraft(ctx, store, outline, settings)
    assert.notEqual(draft.data.slides[1].points[0].text, outline.data.slides[1].points[0].text)
    assert.match(draft.data.slides[1].speakerNotes, /适用条件/)
    const generatedCount = calls.model.filter(text => text.includes('请写一页真正可演讲的成稿')).length
    assert.equal(generatedCount, 13)
    await buildDeckDraft(ctx, store, outline, settings)
    assert.equal(calls.model.filter(text => text.includes('请写一页真正可演讲的成稿')).length,
      generatedCount)
    const record = { ...outline, data: draft.data }
    const deck = await writeDeck(store, record, new Map(), { promptHash: draft.hash })
    await writeDeckPdf(store, record, new Map(), deck)
    const manifest = JSON.parse(await readFile(deck.manifest_path, 'utf8'))
    assert.deepEqual(manifest.sourceIds, [ids[0]])
    assert.equal(manifest.sources.length, 1)
    assert.match(manifest.slides[1].takeaway.text, /详细成稿/)
    assert.deepEqual(manifest.slides[1].webCitations.map(ref => ref.id), ['W1'])
    const pptx = await JSZip.loadAsync(await readFile(deck.path))
    assert.match(await pptx.file('ppt/slides/slide2.xml').async('string'), /详细成稿/)
    assert.match(await pptx.file('ppt/notesSlides/notesSlide2.xml').async('string'), /example.org\/background/)
    assert.ok(store.deckByHash(draft.hash)?.pdf_path)
    assert.match(pdfText(store.deck(deck.id).pdf_path), /详细成稿/)
    assert.match(pdfText(store.deck(deck.id).pdf_path), /网络/)

    const report = await buildReport(ctx, store, settings, PROMPT, undefined, () => {}, options)
    const exported = await renderReport(store, report, settings)
    const reportManifest = JSON.parse(await readFile(exported.manifest_path, 'utf8'))
    assert.deepEqual(reportManifest.sourceIds, [ids[0]])
    assert.equal(reportManifest.webSources[0].url, 'https://example.org/background')
    assert.equal(reportManifest.claims[0].webCitations[0].id, 'W1')
    const docx = await JSZip.loadAsync(await readFile(exported.docx_path))
    const xml = await docx.file('word/document.xml').async('string')
    assert.match(xml, /example.org\/background/)
    assert.doesNotMatch(xml, /Excluded Paper/)
    assert.match(pdfText(exported.pdf_path), /example.org\/background/)
    assert.doesNotMatch(pdfText(exported.pdf_path), /Excluded Paper/)
  } finally { store.close() }
})

test('联网不可用或虚构逐页证据时失败，不产出假成稿', async () => {
  const { store, ids } = await fixture()
  const settings = store.getSettings()
  try {
    const noWeb = fakeContext({ failWeb: true })
    await assert.rejects(buildOutline(noWeb.ctx, store, settings.text, undefined, () => {}, PROMPT,
      { sourceIds: [ids[0]], includeWeb: true }), /联网提供方失败/)
    assert.equal(noWeb.calls.model.length, 0)
    const { ctx } = fakeContext({ invalidDraft: true })
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, { sourceIds: [ids[0]] })
    await assert.rejects(buildDeckDraft(ctx, store, outline, settings), /不存在的文献引用/)
    assert.equal(store.latestDeck(), null)
  } finally { store.close() }
})

test('第六页结论过长会收到长度反馈并修复，保留有效引用', async () => {
  const { store, ids } = await fixture()
  const { ctx, calls } = fakeContext({ overlongTakeaway: true })
  const settings = store.getSettings()
  try {
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, { sourceIds: [ids[0]] })
    const draft = await buildDeckDraft(ctx, store, outline, settings)
    assert.ok(draft.data.slides[5].takeaway.text.length <= 120)
    assert.ok(draft.data.slides[5].takeaway.evidenceIds.length)
    const attempts = calls.model.filter(prompt => prompt.includes('本页是第 6/14 页'))
    assert.equal(attempts.length, 2)
    assert.match(attempts[1], /核心结论须为 1–120 字/)
    assert.doesNotMatch(attempts[1], /核心结论未引用当前/)
  } finally { store.close() }
})

test('第六页漏写引用时反馈字段和可用编号，由模型修复而不是补造引用', async () => {
  const { store, ids } = await fixture()
  const { ctx, calls } = fakeContext({ missingTakeawayRef: true })
  const settings = store.getSettings()
  try {
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, { sourceIds: [ids[0]] })
    const draft = await buildDeckDraft(ctx, store, outline, settings)
    const attempts = calls.model.filter(prompt => prompt.includes('本页是第 6/14 页'))
    assert.equal(attempts.length, 2)
    assert.match(attempts[1], /第 6 页核心结论缺少 refs；请从 E1/)
    assert.match(attempts[1], /"refs":\[\]/)
    assert.ok(draft.data.slides[5].takeaway.evidenceIds.every(id => store.evidence(id)))
  } finally { store.close() }
})

test('一键演示与报告 RPC 校验格式、复用逐页成稿并限制下载会话', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-composition-service-'))
  const { ctx } = fakeContext()
  ctx.sessions = { get: id => id === 'owner' || id === 'other'
    ? { id, header: { cwd: root }, snapshotEvents: () => [] } : null }
  const studio = createStudioService(ctx, { dataRoot: root })
  const store = studio.storeFor('owner')
  const id = `sha256:${'1'.padStart(64, '0')}`
  store.addSource({ attachmentId: id, bytes: 100, name: 'selected.pdf' })
  store.commitParsed(id, { pageCount: 1, title: 'Selected Paper', figures: [],
    pages: [{ page: 1, text: 'Protein design methods and limitations. '.repeat(80) }] })
  const wait = async jobId => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const job = (await studio.handle('getJob', { sessionId: 'owner', jobId })).value
      if (job.state !== 'running') return job
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error('合成任务超时')
  }
  try {
    assert.equal((await studio.handle('generateDeck', { sessionId: 'owner', prompt: PROMPT,
      sourceIds: [id], format: 'html' })).ok, false)
    const started = await studio.handle('generateDeck', { sessionId: 'owner', prompt: PROMPT,
      sourceIds: [id], format: 'pdf' })
    assert.equal(started.ok, true)
    assert.equal((await wait(started.value.job.id)).state, 'succeeded')
    const deck = studio.storeFor('owner').latestDeck()
    assert.ok(deck.pdf_path)
    assert.equal((await studio.download(new Request(`http://localhost/api/studio/deck-pdf?sessionId=owner&deckId=${deck.id}`), 'deck-pdf')).status, 200)
    assert.equal((await studio.download(new Request(`http://localhost/api/studio/deck-pdf?sessionId=other&deckId=${deck.id}`), 'deck-pdf')).status, 404)
    const again = await studio.handle('renderDeck', { sessionId: 'owner', revision: 1, format: 'pptx' })
    assert.equal(again.value.reused, true)
    const report = await studio.handle('generateReport', { sessionId: 'owner', prompt: PROMPT,
      sourceIds: [id], format: 'docx' })
    assert.equal((await wait(report.value.job.id)).state, 'succeeded')
    assert.ok(store.latestReport().docx_path)
    assert.ok(store.latestReport().pdf_path)
    const outline = store.getOutline()
    const tampered = structuredClone(outline.data)
    tampered.sourceIds = ['sha256:' + 'f'.repeat(64)]
    tampered.webSources = [{ id: 'W1', url: 'https://forged.example.org', snippet: '伪造' }]
    const saved = await studio.handle('saveOutline', { sessionId: 'owner', revision: outline.revision,
      outline: tampered })
    assert.equal(saved.ok, true)
    assert.deepEqual(saved.value.data.sourceIds, [id])
    assert.deepEqual(saved.value.data.webSources, [])
  } finally { await studio.shutdown() }
})

test('图片模型不可用时报告和演示仍导出，并明确提示流程图降级', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-image-fallback-'))
  const { ctx } = fakeContext({ imageVisuals: true })
  ctx.sessions = { get: sessionId => sessionId === 'owner'
    ? { id: sessionId, header: { cwd: root }, snapshotEvents: () => [] } : null }
  const studio = createStudioService(ctx, { dataRoot: root })
  const store = studio.storeFor('owner')
  const sourceId = `sha256:${'1'.padStart(64, '0')}`
  store.addSource({ attachmentId: sourceId, bytes: 100, name: 'selected.pdf' })
  store.commitParsed(sourceId, { pageCount: 1, title: 'Selected Paper', figures: [],
    pages: [{ page: 1, text: 'Protein design methods and limitations. '.repeat(80) }] })
  const settings = store.getSettings()
  store.saveSettings({ ...settings, image: { ...settings.image, enabled: true,
    baseUrl: 'http://127.0.0.1:1/v1' } })
  const wait = async jobId => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const job = (await studio.handle('getJob', { sessionId: 'owner', jobId })).value
      if (job.state !== 'running') return job
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error('合成任务超时')
  }
  try {
    const report = await studio.handle('generateReport', { sessionId: 'owner', prompt: PROMPT,
      sourceIds: [sourceId], format: 'pdf' })
    const reportJob = await wait(report.value.job.id)
    assert.equal(reportJob.state, 'succeeded', reportJob.error)
    assert.match(reportJob.phase, /图片模型不可用.*继续排版/)
    const reportManifest = JSON.parse(await readFile(store.latestReport().manifest_path, 'utf8'))
    assert.ok(reportManifest.visuals.some(item => item.type === 'flow'))
    assert.ok(!reportManifest.visuals.some(item => item.type === 'generated'))
    const canceled = new AbortController()
    canceled.abort()
    await assert.rejects(renderReport(store, store.latestReport(), store.getSettings(), canceled.signal),
      /aborted/i)

    const deck = await studio.handle('generateDeck', { sessionId: 'owner', prompt: PROMPT,
      sourceIds: [sourceId], format: 'pptx' })
    const deckJob = await wait(deck.value.job.id)
    assert.equal(deckJob.state, 'succeeded', deckJob.error)
    assert.match(deckJob.phase, /图片模型不可用.*流程图/)
    const saved = store.latestDeck()
    assert.ok(saved.path && saved.pdf_path)
    const deckManifest = JSON.parse(await readFile(saved.manifest_path, 'utf8'))
    assert.equal(deckManifest.slides.length, 14)
    assert.equal(deckManifest.slides[0].visual.type, 'flow')
    assert.ok(!deckManifest.slides.some(slide => slide.visual.type === 'generated'))
    const retried = await studio.handle('renderDeck', { sessionId: 'owner',
      revision: store.getOutline().revision })
    assert.ok(retried.value.job && !retried.value.reused)
    assert.equal((await wait(retried.value.job.id)).state, 'succeeded')
  } finally { await studio.shutdown() }
})

test('30 篇文献及 6 条网络背景仍可完成 15 页双格式演示和完整报告', async () => {
  const { store, ids } = await fixture(30)
  const { ctx } = fakeContext({ manyWeb: true })
  const settings = store.getSettings()
  const options = { sourceIds: ids, includeWeb: true }
  try {
    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, PROMPT, options)
    assert.equal(outline.data.webSources.length, 6)
    const draft = await buildDeckDraft(ctx, store, outline, settings)
    const record = { ...outline, data: draft.data }
    const deck = await writeDeck(store, record, new Map(), { promptHash: draft.hash })
    const pdf = await writeDeckPdf(store, record, new Map(), deck)
    const manifest = JSON.parse(await readFile(pdf.manifest_path, 'utf8'))
    assert.equal(manifest.sources.length, 30)
    assert.equal(manifest.webSources.length, 6)
    const pptx = await JSZip.loadAsync(await readFile(pdf.path))
    assert.match(await pptx.file('ppt/slides/slide15.xml').async('string'), /W6/)
    assert.match(pdfText(pdf.pdf_path), /W6/)
    const report = await buildReport(ctx, store, settings, PROMPT, undefined, () => {}, options)
    const exported = await renderReport(store, report, settings)
    assert.equal(report.data.tableRows.length, 30)
    assert.match(pdfText(exported.pdf_path), /Paper 30/)
  } finally { store.close() }
})
