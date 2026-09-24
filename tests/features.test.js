import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { writeDeck } from '../src/deck.js'
import { writeDeckPdf } from '../src/deck-pdf.js'
import { generateConceptImage } from '../src/image.js'
import { buildOutline, modelText } from '../src/model.js'
import { buildReport, renderReport, validateReport } from '../src/report.js'
import { apiEndpoint } from '../src/settings.js'
import { StudioStore } from '../src/store.js'
import { StudioUploads } from '../src/uploads.js'

function chunk(type, data) {
  const label = Buffer.from(type)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([label, data])))
  return Buffer.concat([size, label, data, checksum])
}

function samplePng() {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(512, 0)
  header.writeUInt32BE(512, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(512 * (1 + 512 * 3)))),
    chunk('IEND', Buffer.alloc(0))])
}

async function fixture(withFigure = true) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-studio-new-'))
  const store = new StudioStore('new-features', root)
  for (let index = 1; index <= 3; index++) {
    const hash = index.toString(16).padStart(64, '0')
    const id = `sha256:${hash}`
    store.addSource({ attachmentId: id, name: `research-${index}.pdf`, bytes: 200 })
    const figurePath = `figures/${hash}-p001-f01.png`
    if (withFigure && index === 1) await writeFile(join(store.directory, figurePath), samplePng())
    store.commitParsed(id, { pageCount: 1, title: `Research ${index}`,
      pages: [{ page: 1, text: 'Protein design results and limitations from paper. '.repeat(120) }],
      figures: withFigure && index === 1 ? [{ id: `${hash}:p1:f1`, page: 1,
        caption: 'Figure 1. Workflow', path: figurePath, bbox: [20, 20, 300, 300],
        width: 512, height: 512, score: 2 }] : [] })
  }
  return store
}

function fakeModel(visualKind = index => index === 0 ? 'generated' : index === 1 ? 'paper'
  : index === 12 ? 'table' : 'flow', reportVisuals) {
  const ctx = { llm: { async *stream(options) {
    const prompt = options.messages[0].content[0].text
    let answer
    if (prompt.includes('文献：')) answer = { summary: '方法与结果',
      claims: [{ text: '蛋白质设计的可核实结论', refs: ['E1'] }] }
    else if (prompt.includes('合并成')) answer = { themes: [{
      text: '这些文献比较了蛋白质设计方法', refs: ['C1', 'C2'] }] }
    else if (prompt.includes('生成中文学术报告')) answer = {
      title: '蛋白质设计文献报告',
      overview: [{ text: '研究的核心是以明确证据分析设计方法。', refs: ['R1'] }],
      sections: Array.from({ length: 4 }, (_, index) => ({
        title: `研究议题 ${index + 1}`,
        paragraphs: [{ text: `此处分析议题 ${index + 1} 的方法与局限。`, refs: ['R1'] }],
        visuals: reportVisuals?.(index),
      })),
    }
    else if (prompt.includes('制作中文')) {
      const [, first, last] = prompt.match(/本次只生成第 (\d+)–(\d+) 页/)
      answer = { title: '蛋白质设计综述',
        slides: Array.from({ length: last - first + 1 }, (_, offset) => {
          const index = Number(first) - 1 + offset
          return { title: `议题 ${index + 1}`,
            points: index ? [{ text: '证据支持的方法结论', refs: ['R1'] }] : [],
            visualKind: visualKind(index),
            flowNodes: ['问题', '方法', '核验'],
          }
        }) }
    }
    else answer = 'protein design'
    yield { type: 'text-delta', index: 0,
      text: typeof answer === 'string' ? answer : JSON.stringify(answer) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } }
  return ctx
}

test('会话设置隐藏密钥，模型变更使摘要缓存失效', async () => {
  const store = await fixture(false)
  try {
    assert.equal(store.publicSettings().image.enabled, false)
    assert.equal(store.publicSettings().image.timeoutSeconds, 600)
    store.putSummary(store.listSources()[0].id, { summary: '旧模型', claims: [] })
    const saved = store.saveSettings({
      text: { mode: 'custom', baseUrl: 'https://api.example.org/v1',
        model: 'example-chat', apiKey: 'secret-text' },
      image: { enabled: true, baseUrl: 'http://127.0.0.1:11234/v1',
        model: 'Qwen', apiKey: 'secret-image' },
    })
    assert.equal(saved.text.apiKey, undefined)
    assert.equal(saved.text.hasApiKey, true)
    assert.equal(store.getSummary(store.listSources()[0].id), null)
    assert.equal(store.getSettings().text.apiKey, 'secret-text')
    assert.ok(!JSON.stringify(saved).includes('secret-'))
    assert.equal((await stat(join(store.directory, 'studio.sqlite'))).mode & 0o777, 0o600)
    const cleared = store.saveSettings({ text: { ...saved.text, apiKey: '',
      clearApiKey: true }, image: { ...saved.image, enabled: false, apiKey: '',
      clearApiKey: true } })
    assert.equal(cleared.text.hasApiKey, false)
    assert.equal(cleared.image.hasApiKey, false)
    assert.throws(() => store.saveSettings({ ...cleared, image: { ...cleared.image, timeoutSeconds: 0 } }), /等待时间/)
    assert.throws(() => apiEndpoint('http://example.org/v1', 'images/generations'), /HTTPS/)
    assert.throws(() => apiEndpoint('http://127.0.0.1/v1/%2e%2e/admin', 'chat/completions'), /无效/)
  } finally { store.close() }
})

test('自定义 OpenAI 兼容文本接口携带 API Key 且不暴露在响应中', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: '严格依据文献' } }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = server.address().port
    const text = await modelText({}, 'session', 'system', 'prompt', {
      mode: 'custom', baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'example-chat', apiKey: 'test-key' }, 100)
    assert.equal(text, '严格依据文献')
    assert.deepEqual(requests, [{ url: '/v1/chat/completions',
      authorization: 'Bearer test-key' }])
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('自定义图片模型使用配置的 URL、模型与密钥；关闭时无需请求图片', async () => {
  const store = await fixture(false)
  const requests = []
  try {
    const settings = { baseUrl: 'https://images.example.org/v1', model: 'illustrator',
      apiKey: 'hidden-image-key' }
    const fakeFetch = async (url, request) => {
      requests.push({ url, model: JSON.parse(request.body).model,
        authorization: request.headers.authorization })
      return new Response(JSON.stringify({ data: [{ b64_json: samplePng().toString('base64') }] }),
        { status: 200 })
    }
    const first = await generateConceptImage(store, 'Scientific overview, no text', settings,
      { fetch: fakeFetch })
    const again = await generateConceptImage(store, 'Scientific overview, no text', settings,
      { fetch: fakeFetch })
    assert.equal(first.path, again.path)
    assert.equal(requests.length, 1)
    assert.deepEqual(requests[0], { url: 'https://images.example.org/v1/images/generations',
      model: 'illustrator', authorization: 'Bearer hidden-image-key' })
    await assert.rejects(generateConceptImage(store, 'Private prompt', settings, {
      fetch: async () => new Response('forbidden', { status: 401 }),
    }), error => !error.message.includes('hidden-image-key') && /HTTP 401/.test(error.message))
  } finally { store.close() }
})

test('Studio 分块上传验证偏移、会话和哈希，并拒绝 30 MB 边界', async () => {
  const store = await fixture(false)
  const other = new StudioStore('other-session', await mkdtemp(join(tmpdir(), 'dsh-other-')))
  const uploads = new StudioUploads()
  try {
    await assert.rejects(uploads.start(store, 'large.pdf', 30_000_000), /小于 30 MB/)
    const bytes = Buffer.from('%PDF-1.4\nTest content\n')
    const { uploadId } = await uploads.start(store, 'new.pdf', bytes.length)
    await assert.rejects(uploads.chunk(other, uploadId, 0, bytes.toString('base64')), /不属于/)
    await assert.rejects(uploads.chunk(store, uploadId, 1, bytes.toString('base64')), /偏移/)
    await uploads.chunk(store, uploadId, 0, bytes.toString('base64'))
    const result = await uploads.finish(store, uploadId)
    assert.equal(result.ref.attachmentId, `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
    assert.deepEqual(await readFile(result.path), bytes)
    const next = await uploads.start(store, 'new.pdf', bytes.length)
    await uploads.chunk(store, next.uploadId, 0, bytes.toString('base64'))
    const duplicate = await uploads.finish(store, next.uploadId)
    assert.equal(duplicate.added, true)
    assert.equal(store.listSources().length, 4)
    const abandoned = await uploads.start(store, 'abandoned.pdf', bytes.length)
    const resumed = await uploads.start(store, 'replacement.pdf', bytes.length)
    await assert.rejects(uploads.chunk(store, abandoned.uploadId, 0,
      bytes.toString('base64')), /不存在/)
    await uploads.cancel(store, resumed.uploadId)
  } finally {
    await uploads.close()
    store.close()
    other.close()
  }
})

test('不启用生图时生成带原图、表格和中文的报告 DOCX/PDF 与 PPTX/PDF', async () => {
  const store = await fixture(true)
  const ctx = fakeModel()
  const settings = store.getSettings()
  try {
    const report = await buildReport(ctx, store, settings, '梳理方法和局限')
    const exported = await renderReport(store, report, settings)
    assert.ok(exported.docx_path && exported.pdf_path)
    const docx = await JSZip.loadAsync(await readFile(exported.docx_path))
    const documentXml = await docx.file('word/document.xml').async('string')
    assert.match(documentXml, /蛋白质设计文献报告/)
    assert.match(documentXml, /<w:tbl>/)
    assert.ok(docx.file(/word\/media\//).length > 0)
    const reportManifest = JSON.parse(await readFile(exported.manifest_path, 'utf8'))
    assert.equal(reportManifest.visuals.some(item => item.type === 'generated'), false)
    assert.ok(reportManifest.visuals.some(item => item.type === 'paper'))
    assert.ok(reportManifest.claims.every(item => item.citations.every(ref => ref.page === 1)))

    const outline = await buildOutline(ctx, store, { ...settings.text, imageEnabled: false },
      undefined, () => {}, '梳理方法和局限')
    assert.equal(outline.data.slides.some(slide => slide.visualKind === 'generated'), false)
    assert.ok(outline.data.slides.some(slide => slide.visualKind === 'table'))
    const deck = await writeDeck(store, outline, new Map())
    const exportedDeck = await writeDeckPdf(store, outline, new Map(), deck)
    const pptx = await JSZip.loadAsync(await readFile(deck.path))
    const manifest = JSON.parse(await readFile(deck.manifest_path, 'utf8'))
    assert.ok(manifest.slides.some(slide => slide.visual.type === 'table'))
    const paperVisual = manifest.slides.find(slide => slide.visual.type === 'paper').visual
    assert.equal(paperVisual.caption, 'Figure 1. Workflow')
    assert.ok(paperVisual.purpose)
    assert.ok(pptx.file('ppt/slides/slide15.xml'))
    const tableNumber = manifest.slides.find(slide => slide.visual.type === 'table').number
    assert.match(await pptx.file(`ppt/slides/slide${tableNumber}.xml`).async('string'), /<a:tbl>/)
    assert.ok(exportedDeck.pdf_path)
    for (const pdf of [exported.pdf_path, exportedDeck.pdf_path]) {
      const check = spawnSync(join(process.cwd(), '.venv', 'bin', 'python'), ['-c',
        'import pymupdf,sys; d=pymupdf.open(sys.argv[1]); print(len(d)); print("".join(p.get_text() for p in d)[:3000])', pdf],
      { encoding: 'utf8' })
      assert.equal(check.status, 0, check.stderr)
      assert.match(check.stdout, /蛋白质设计/)
      assert.ok(Number(check.stdout.split('\n')[0]) >= (pdf === exportedDeck.pdf_path ? 15 : 3))
    }
  } finally { store.close() }
})

test('报告按章节插入多张相关原图、生成图、流程图和表格', async () => {
  const store = await fixture(true)
  const sources = store.listSources()
  const secondHash = sources[1].id.slice(7)
  const secondFigureId = `${secondHash}:p1:f1`
  const figurePath = `figures/${secondHash}-p001-f01.png`
  await writeFile(join(store.directory, figurePath), samplePng())
  store.commitParsed(sources[1].id, { pageCount: 1, title: '第二种验证方法',
    pages: [{ page: 1, text: 'Protein design validation methods and comparison. '.repeat(80) }],
    figures: [{ id: secondFigureId, page: 1, caption: 'Validation comparison',
      path: figurePath, bbox: [0, 0, 512, 512], width: 512, height: 512, score: 2 }] })
  const firstFigure = store.figures().find(figure => figure.source_id === sources[0].id)
  const requests = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const part of request) body += part
    requests.push(JSON.parse(body).prompt)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: [{ b64_json: samplePng().toString('base64') }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const plans = [
    [{ type: 'paper', figureId: firstFigure.id, caption: `方法原图：${'设计方法与文献验证之间的关系。'.repeat(14)}` },
      { type: 'generated', caption: '方法概念图', prompt: 'Method relationships' }],
    [{ type: 'flow', caption: '验证流程', nodes: ['提出设计', '执行验证', '检查局限'] }],
    [{ type: 'paper', figureId: secondFigureId, caption: '验证原图' },
      { type: 'generated', caption: '验证概念图', prompt: 'Validation concept' }],
    [{ type: 'table', caption: '方法证据对照' },
      { type: 'generated', caption: '局限概念图', prompt: 'Limitations concept' }],
  ]
  const settings = { ...store.getSettings(), image: { enabled: true,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'synthetic-image' } }
  try {
    const report = await buildReport(fakeModel(undefined, index => plans[index]), store, settings, '比较方法与验证')
    const files = await renderReport(store, report, settings)
    const manifest = JSON.parse(await readFile(files.manifest_path, 'utf8'))
    assert.equal(manifest.visuals.length, 7)
    assert.equal(manifest.visuals.filter(visual => visual.type === 'paper').length, 2)
    assert.equal(manifest.visuals.filter(visual => visual.type === 'generated').length, 3)
    assert.deepEqual(manifest.visuals.map(visual => visual.section), [1, 1, 2, 3, 3, 4, 4])
    assert.equal(requests.length, 3)
    assert.ok(requests.every(prompt => prompt.includes('Context:') && prompt.includes('no data charts')))
    const archive = await JSZip.loadAsync(await readFile(files.docx_path))
    const document = await archive.file('word/document.xml').async('string')
    assert.ok(document.indexOf('方法原图') < document.indexOf('研究议题 2'))
    assert.ok(document.indexOf('验证原图') > document.indexOf('研究议题 3'))
    assert.ok(document.indexOf('验证原图') < document.indexOf('研究议题 4'))
    const layout = spawnSync(join(process.cwd(), '.venv', 'bin', 'python'), ['-c',
      'import pymupdf,sys\ndoc=pymupdf.open(sys.argv[1])\nfor page in doc:\n for block in page.get_text("blocks"):\n  assert block[0]>=0 and block[1]>=0 and block[2]<=page.rect.width+1 and block[3]<=page.rect.height+1, block\n if "方法原图" in page.get_text():\n  assert "Figure 1. Workflow" in page.get_text()\n  assert page.get_images()\nprint("layout ok")', files.pdf_path],
    { encoding: 'utf8' })
    assert.equal(layout.status, 0, layout.stderr)
    const invalid = structuredClone(report.data)
    invalid.sections[0].visuals[0].figureId = 'not-a-figure'
    assert.throws(() => validateReport(store, invalid), /候选图/)
  } finally {
    await new Promise(resolve => server.close(resolve))
    store.close()
  }
})

test('没有文献原图和生图服务时仍能输出流程图与可编辑表格', async () => {
  const store = await fixture(false)
  const ctx = fakeModel()
  const settings = store.getSettings()
  try {
    const report = await buildReport(ctx, store, settings, '比较方法')
    const files = await renderReport(store, report, settings)
    const manifest = JSON.parse(await readFile(files.manifest_path, 'utf8'))
    assert.equal(manifest.visuals.length, report.data.sections.length)
    assert.ok(manifest.visuals.every(item => item.type === 'flow'))
    const outline = await buildOutline(ctx, store, { ...settings.text,
      imageEnabled: false }, undefined, () => {}, '比较方法')
    assert.ok(outline.data.slides.every(slide => !['paper', 'generated'].includes(slide.visualKind)))
    const deck = await writeDeck(store, outline, new Map())
    assert.ok((await stat(deck.path)).size > 1000)
    assert.ok((await writeDeckPdf(store, outline, new Map(), deck)).pdf_path)
  } finally { store.close() }
})

test('图表版位随内容计划变化，AI 图不再固定为两张', async () => {
  const store = await fixture(true)
  try {
    const outline = await buildOutline(fakeModel(index => [0, 4, 8].includes(index) ? 'generated'
      : index === 2 ? 'paper' : index === 10 ? 'table' : 'flow'), store,
      { imageEnabled: true })
    assert.equal(outline.data.slides.filter(slide => slide.visualKind === 'generated').length, 3)
    assert.equal(outline.data.slides[2].visualKind, 'paper')
    assert.equal(outline.data.slides[10].visualKind, 'table')
    assert.equal(outline.data.slides[13].visualKind, 'flow')
    assert.ok(outline.data.slides[2].figureId)
  } finally { store.close() }
})
