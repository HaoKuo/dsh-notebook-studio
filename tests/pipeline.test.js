import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { writeDeck } from '../src/deck.js'
import { decodeGeneratedImage, generateConceptImage, imageEndpoint } from '../src/image.js'
import { buildOutline, searchWithRewrite, validateOutline } from '../src/model.js'
import { StudioStore } from '../src/store.js'

function pngChunk(type, data) {
  const name = Buffer.from(type)
  const header = Buffer.alloc(4)
  header.writeUInt32BE(data.length)
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([header, name, data, sum])
}

function samplePng() {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(512, 0)
  header.writeUInt32BE(512, 4)
  header[8] = 8
  header[9] = 2
  const rows = Buffer.alloc(512 * (1 + 512 * 3))
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))])
}

function fakeModel(generatedSlides = [0, 5]) {
  const calls = []
  const ctx = { llm: { async *stream(options) {
    assert.equal(options.provider, 'deepseek-official')
    assert.equal(options.model, 'deepseek-flash')
    calls.push(options)
    let answer
    if (options.messages[0].content[0].text.includes('文献：')) {
      answer = { summary: '客观摘要', claims: [{ text: '蛋白质设计研究方法', refs: ['E1'] }] }
    } else if (options.messages[0].content[0].text.includes('合并成')) {
      answer = { themes: [{ text: '多篇研究讨论蛋白质设计', refs: ['C1'] }] }
    } else if (options.messages[0].content[0].text.includes('制作中文')) {
      const prompt = options.messages[0].content[0].text
      const [, first, last] = prompt.match(/本次只生成第 (\d+)–(\d+) 页/)
      answer = { title: '蛋白质设计综述', slides: Array.from({ length: last - first + 1 }, (_, offset) => {
        const index = Number(first) - 1 + offset
        return {
          title: `研究主题 ${index + 1}`,
          points: index === 0 ? [] : [{ text: '此结论来自文献证据', refs: ['R1'] }],
          visualKind: generatedSlides.includes(index) ? 'generated'
            : [1, 2].includes(index) ? 'paper' : 'flow',
          flowNodes: ['问题', '方案', '核验'],
        }
      }) }
    } else answer = 'protein design'
    yield { type: 'text-delta', index: 0, text: typeof answer === 'string' ? answer : JSON.stringify(answer) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } }
  return { ctx, calls }
}

async function sourceStore(count = 12) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pipeline-'))
  const store = new StudioStore('pipeline-session', root)
  const png = samplePng()
  for (let index = 1; index <= count; index++) {
    const hash = index.toString(16).padStart(64, '0')
    const ref = { attachmentId: `sha256:${hash}`, bytes: 200, name: `paper-${index}.pdf` }
    store.addSource(ref)
    const path = `figures/${hash}-p001-f01.png`
    if (index === 1) await writeFile(join(store.directory, path), png)
    store.commitParsed(ref.attachmentId, {
      title: `Paper ${index}`, pageCount: 1, doi: `10.1234/paper${index}`,
      pages: [{ page: 1, text: 'Protein design evidence from this article. '.repeat(90) }],
      figures: index === 1 ? [{ id: `${hash}:p1:f1`, page: 1,
        caption: 'Fig. 1. Protein design workflow', path, bbox: [50, 50, 300, 300],
        width: 512, height: 512, score: 2 }] : [],
    })
  }
  return store
}

test('12 篇证据分层汇总、缓存与大纲引用校验', async () => {
  const store = await sourceStore()
  const { ctx, calls } = fakeModel()
  try {
    const outline = await buildOutline(ctx, store, { provider: 'deepseek-official', model: 'deepseek-flash' })
    assert.equal(outline.data.slides.length, 14)
    assert.equal(outline.data.slides.filter(slide => slide.visualKind === 'generated').length, 2)
    assert.ok(outline.data.slides[1].figureId)
    assert.equal(calls.length, 18)
    const matches = await searchWithRewrite(ctx, store, '蛋白质设计', {})
    assert.ok(matches.length)
    assert.equal(calls.length, 19)
    await buildOutline(ctx, store, {})
    assert.equal(calls.length, 23)
    assert.throws(() => validateOutline(store, {
      ...outline.data, slides: outline.data.slides.map((slide, index) =>
        index === 1 ? { ...slide, points: [{ text: '伪造证据', evidenceIds: ['nonexistent'] }] } : slide),
    }), /无页码依据/)
    assert.throws(() => store.saveOutline(outline.data, 0), /刷新后重试/)
  } finally {
    store.close()
  }
})

test('文本模型只需要一张概念图时不强制补齐两张', async () => {
  const store = await sourceStore(1)
  const { ctx } = fakeModel([0])
  try {
    const { data } = await buildOutline(ctx, store, {})
    assert.equal(data.slides.filter(slide => slide.visualKind === 'generated').length, 1)
    assert.ok(data.slides.some(slide => slide.visualKind === 'paper' && slide.figureId))
    assert.ok(data.slides.some(slide => slide.visualKind === 'flow'))
  } finally {
    store.close()
  }
})

test('文本模型连续返回无效大纲时不给出成稿', async () => {
  const store = await sourceStore(1)
  const { ctx } = fakeModel()
  const stream = ctx.llm.stream
  ctx.llm.stream = async function* (options) {
    if (options.messages[0].content[0].text.includes('制作中文')) {
      yield { type: 'text-delta', index: 0, text: '不是 JSON 大纲' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } else {
      yield* stream(options)
    }
  }
  try {
    await assert.rejects(buildOutline(ctx, store, {}), /连续两次返回无效结果/)
    assert.equal(store.getOutline(), null)
  } finally {
    store.close()
  }
})

test('模型返回错误批次页数时拒绝保存不完整大纲', async () => {
  const store = await sourceStore(1)
  const { ctx } = fakeModel()
  const stream = ctx.llm.stream
  ctx.llm.stream = async function* (options) {
    if (options.messages[0].content[0].text.includes('本次只生成第 1–4 页')) {
      yield { type: 'text-delta', index: 0, text: JSON.stringify({ title: '不完整大纲', slides: [] }) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } else yield* stream(options)
  }
  try {
    await assert.rejects(buildOutline(ctx, store, {}), /第 1 批大纲必须返回 4 张幻灯片/)
    assert.equal(store.getOutline(), null)
  } finally { store.close() }
})

test('图片接口拒绝远程地址与损坏图片，缓存成功图片', async () => {
  const store = await sourceStore(1)
  const png = samplePng()
  let called = 0
  const fakeFetch = async (_url, request) => {
    assert.equal(JSON.parse(request.body).size, '1024x1024')
    called++
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 })
  }
  try {
    assert.throws(() => imageEndpoint('http://example.com/v1'), /HTTPS|回环/)
    assert.equal(imageEndpoint('https://example.com/v1'), 'https://example.com/v1/images/generations')
    assert.throws(() => imageEndpoint('http://127.0.0.1:11234/v1/../admin'), /无效/)
    assert.equal(decodeGeneratedImage({ data: [{ b64_json: png.toString('base64') }] }).width, 512)
    const broken = Buffer.from(png)
    broken[broken.length - 6] ^= 1
    assert.throws(() => decodeGeneratedImage({ data: [{ b64_json: broken.toString('base64') }] }), /校验和/)
    const first = await generateConceptImage(store, 'Molecules, no text', {}, { fetch: fakeFetch })
    const again = await generateConceptImage(store, 'Molecules, no text', {}, { fetch: fakeFetch })
    assert.equal(called, 1)
    assert.equal(first.path, again.path)
    assert.equal(again.reused, true)
    await assert.rejects(generateConceptImage(store, 'Bad response', {}, {
      fetch: async () => new Response('{"data":[]}', { status: 200 }),
    }), /无效/)
  } finally {
    store.close()
  }
})

test('取消图片请求时保留取消原因，不缓存损坏素材', async () => {
  const store = await sourceStore(1)
  const controller = new AbortController()
  try {
    await assert.rejects(generateConceptImage(store, 'Timeout smoke test', {}, {
      signal: controller.signal,
      fetch: async (_url, request) => new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(new Error('request timed out')),
          { once: true })
        controller.abort()
      }),
    }), error => error.name === 'AbortError')
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM generated_assets').get().count, 0)
  } finally {
    store.close()
  }
})

test('生图超时与连接失败分别提供可操作提示', async () => {
  const store = await sourceStore(1)
  const keepAlive = setInterval(() => {}, 100)
  try {
    await assert.rejects(generateConceptImage(store, 'Timeout diagnostic', { timeoutSeconds: 600 }, {
      timeoutMs: 5,
      fetch: async (_url, request) => new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
      }),
    }), /等待超过 600 秒.*模型设置/)
    await assert.rejects(generateConceptImage(store, 'Connection diagnostic', {}, {
      fetch: async () => { throw new Error('fetch failed') },
    }), /连接失败.*服务是否启动/)
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM generated_assets').get().count, 0)
  } finally { clearInterval(keepAlive); store.close() }
})

test('15 页 PPTX 含三类素材、可编辑流程形状、页码备注和清单', async () => {
  const store = await sourceStore()
  const { ctx } = fakeModel()
  try {
    const outline = await buildOutline(ctx, store, {})
    const image = samplePng()
    const assets = new Map()
    for (const index of [0, 5]) {
      const path = join(store.directory, 'generated', `slide-${index}.png`)
      await writeFile(path, image)
      assets.set(index, { path, model: 'Qwen-Image-2.1', key: `image-${index}`,
        size: { width: 512, height: 512 } })
    }
    const deck = await writeDeck(store, outline, assets)
    const archive = await JSZip.loadAsync(await readFile(deck.path))
    assert.ok(archive.file('ppt/slides/slide15.xml'))
    assert.ok(archive.file('ppt/notesSlides/notesSlide2.xml'))
    const flow = await archive.file('ppt/slides/slide4.xml').async('string')
    assert.match(flow, /<p:sp>/)
    assert.match(flow, /问题/)
    const paper = await archive.file('ppt/slides/slide2.xml').async('string')
    assert.match(paper, /<p:pic>/)
    const notes = await archive.file('ppt/notesSlides/notesSlide2.xml').async('string')
    assert.match(notes, /PDF p\.1/)
    assert.match(notes, /sha256:/)
    const manifest = JSON.parse(await readFile(deck.manifest_path, 'utf8'))
    assert.equal(manifest.sources.length, 12)
    assert.equal(manifest.slides.length, 14)
    assert.equal(manifest.slides[1].visual.type, 'paper')
    assert.equal(manifest.slides[3].visual.editable, true)
    assert.equal(manifest.slides[5].visual.evidence, false)
  } finally {
    store.close()
  }
})
