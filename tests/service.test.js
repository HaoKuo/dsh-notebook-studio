import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply, createStudioService } from '../src/index.js'
import { StudioStore } from '../src/store.js'

test('所有下载和预览路由声明 buffered，HTTP GET 完整传输文件而不是空的 400', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-http-download-'))
  const store = new StudioStore('owner', root)
  const id = '33333333-3333-4333-8333-333333333333'
  const bytes = Buffer.from('PK\x03\x04完整的成稿内容'.repeat(5000))
  const file = join(store.directory, 'decks', 'fixture.pptx')
  await writeFile(file, bytes)
  store.saveDeck(id, 1, file, file)
  store.saveDeckPdf(id, file)
  store.saveReport(id, 'report', { title: '测试报告' })
  store.finishReport(id, file, file, file)
  store.close()
  const routes = new Map()
  const disposers = []
  apply({ sessions: { list: () => [], get: sessionId => ({ id: sessionId, header: { cwd: root },
    snapshotEvents: () => [] }) }, connection: { rpc: { handle() {} },
    fetch: { register: route => routes.set(route.path, route) } }, tools: { register() {} },
    on() {}, effect: dispose => disposers.push(dispose) }, { dataRoot: root })
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      const route = routes.get(url.pathname)
      // 保留 dsh HTTP bridge 的请求体分支，旧配置会在 GET 携带 body 时抛错。
      const incoming = new Request(url, { method: request.method,
        ...(route.requestBody === 'buffered' ? {} : { body: Readable.toWeb(request), duplex: 'half' }) })
      const result = await route.fetch(incoming)
      response.writeHead(result.status, Object.fromEntries(result.headers))
      if (result.body) for await (const chunk of result.body) response.write(chunk)
      response.end()
    } catch { response.writeHead(400).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    assert.equal(routes.size, 6)
    for (const route of routes.values()) {
      assert.equal(route.requestBody, 'buffered')
      const url = `http://127.0.0.1:${server.address().port}${route.path}?sessionId=owner&deckId=${id}&reportId=${id}&preview=1`
      const response = await fetch(url)
      assert.equal(response.status, 200)
      assert.equal(Number(response.headers.get('content-length')), bytes.length)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
      if (route.path.endsWith('-pdf')) assert.match(response.headers.get('content-disposition'), /^inline/)
      const head = await fetch(url, { method: 'HEAD' })
      assert.equal(head.status, 200)
      assert.equal(Number(head.headers.get('content-length')), bytes.length)
      assert.equal((await head.arrayBuffer()).byteLength, 0)
    }
    await writeFile(file, '')
    const empty = await fetch(`http://127.0.0.1:${server.address().port}/api/studio/deck?sessionId=owner&deckId=${id}`)
    assert.equal(empty.status, 400)
    assert.match(await empty.text(), /成稿文件为空/)
  } finally {
    await new Promise(resolve => server.close(resolve))
    for (const dispose of disposers) await dispose()
  }
})

test('冷会话只读加载，未知会话不能读取项目或下载文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-studio-service-'))
  const inspected = []
  let available = false
  const ctx = {
    sessions: { get: () => null },
    sessionController: { async inspect(id) {
      inspected.push(id)
      if (id !== 'cold-session' && !available) throw new Error('会话不存在')
      return { meta: { cwd: root }, events: [] }
    } },
  }
  const studio = createStudioService(ctx, { dataRoot: join(root, 'projects') })
  try {
    const first = await studio.handle('listSources', { sessionId: 'cold-session' })
    assert.equal(first.ok, true)
    assert.deepEqual(first.value.sources, [])
    assert.equal((await studio.handle('getJob', { sessionId: 'cold-session' })).ok, true)
    assert.deepEqual(inspected, ['cold-session'])

    const missing = await studio.handle('listSources', { sessionId: 'missing-session' })
    assert.equal(missing.ok, false)
    assert.match(missing.error.message, /会话不存在/)
    assert.equal((await readdir(join(root, 'projects'))).length, 1)

    const url = 'http://localhost/api/studio/deck?sessionId=missing-session&deckId=00000000-0000-0000-0000-000000000000'
    const response = await studio.download(new Request(url), 'deck')
    assert.equal(response.status, 400)
    assert.match(await response.text(), /会话不存在/)

    available = true
    assert.equal((await studio.handle('listSources', { sessionId: 'missing-session' })).ok, true)
    assert.equal(inspected.filter(id => id === 'missing-session').length, 3)
  } finally {
    await studio.shutdown()
  }
})

test('模型设置 RPC 脱敏、模型目录与跨会话文件下载隔离', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-studio-service-'))
  const sessions = new Map([['owner', { id: 'owner', header: { cwd: root },
    snapshotEvents: () => [] }], ['other', { id: 'other', header: { cwd: root },
    snapshotEvents: () => [] }]])
  const ctx = { sessions: { get: id => sessions.get(id) },
    llm: { listProviders: () => [{ id: 'local', name: '本机' }],
      listModels: async () => [{ id: 'text', name: '文本', inputModalities: ['text'] },
        { id: 'image-only', name: '生图', inputModalities: ['image'] }] } }
  const studio = createStudioService(ctx, { dataRoot: join(root, 'projects') })
  try {
    const settings = await studio.handle('saveSettings', { sessionId: 'owner', settings: {
      text: { mode: 'custom', baseUrl: 'https://api.example.org/v1',
        model: 'text', apiKey: 'hidden-key' },
      image: { enabled: false, baseUrl: 'http://127.0.0.1:11234/v1', model: 'Qwen' },
    } })
    assert.equal(settings.ok, true)
    assert.ok(!JSON.stringify(settings).includes('hidden-key'))
    const publicValue = await studio.handle('getSettings', { sessionId: 'owner' })
    assert.equal(publicValue.value.text.hasApiKey, true)
    const models = await studio.handle('listModels', { sessionId: 'owner' })
    assert.deepEqual(models.value[0].models, [{ id: 'text', name: '文本' }])

    const store = studio.storeFor('owner')
    const id = '11111111-1111-4111-8111-111111111111'
    const report = store.saveReport(id, 'hash', { title: '测试报告',
      overview: [], sections: [] })
    const pdf = join(store.directory, 'reports', `${id}.pdf`)
    await writeFile(pdf, '%PDF-test', { mode: 0o600 })
    store.finishReport(report.id, pdf, pdf, pdf)
    const own = await studio.download(new Request(`http://localhost/api/studio/report-pdf?sessionId=owner&reportId=${id}`), 'report-pdf')
    assert.equal(own.status, 200)
    assert.match(own.headers.get('content-disposition'), /^attachment/)
    const preview = await studio.download(new Request(`http://localhost/api/studio/report-pdf?sessionId=owner&reportId=${id}&preview=1`), 'report-pdf')
    assert.equal(preview.headers.get('content-type'), 'application/pdf')
    assert.match(preview.headers.get('content-disposition'), /^inline/)
    const snapshot = await studio.handle('listSources', { sessionId: 'owner' })
    assert.ok(snapshot.value.report.outputDirectory.startsWith(join(await realpath(root), 'notebook-studio')))
    const exported = store.getExport('report', id)
    assert.equal(await readFile(exported.pdfPath, 'utf8'), '%PDF-test')
    await studio.handle('listSources', { sessionId: 'owner' })
    assert.equal(store.getExport('report', id).directory, exported.directory)
    const info = await studio.handle('downloadReport', { sessionId: 'owner', reportId: id })
    assert.match(info.value.previewUrl, /preview=1/)
    const denied = await studio.download(new Request(`http://localhost/api/studio/report-pdf?sessionId=other&reportId=${id}`), 'report-pdf')
    assert.equal(denied.status, 404)
    assert.equal((await studio.handle('downloadReport', { sessionId: 'other', reportId: id })).ok, false)
  } finally { await studio.shutdown() }
})

test('工作区输出目录为符号链接时明确报错，不向外部目录写入', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-export-symlink-'))
  const outside = await mkdtemp(join(tmpdir(), 'studio-export-outside-'))
  await symlink(outside, join(root, 'notebook-studio'))
  const studio = createStudioService({ sessions: { get: id => ({ id,
    header: { cwd: root }, snapshotEvents: () => [] }) } }, { dataRoot: join(root, 'state') })
  try {
    const store = studio.storeFor('owner')
    const id = '22222222-2222-4222-8222-222222222222'
    store.saveReport(id, 'hash', { title: '测试', overview: [], sections: [] })
    const file = join(store.directory, 'reports', 'test.pdf')
    await writeFile(file, '%PDF-test')
    store.finishReport(id, file, file, file)
    const result = await studio.handle('listSources', { sessionId: 'owner' })
    assert.match(result.value.outputWarning, /符号链接/)
    assert.deepEqual(await readdir(outside), [])
  } finally { await studio.shutdown() }
})
