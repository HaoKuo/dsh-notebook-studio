import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createStudioService } from '../src/index.js'
import { modelJson, modelText } from '../src/model.js'

test('DeepSeek 结构化写作关闭推理，max-tokens 时逐步提高额度而不接受残缺结果', async () => {
  const budgets = []
  const ctx = { llm: { async *stream(options) {
    budgets.push(options.maxTokens)
    assert.equal(options.reasoningEffort, 'off')
    yield { type: 'text-delta', index: 0, text: '{"ready":true}' }
    yield { type: 'finish', reason: { kind: options.maxTokens < 1600 ? 'max-tokens' : 'stop' } }
  } } }
  const value = await modelJson(ctx, 'session', 'system', 'prompt',
    { mode: 'dsh', provider: 'deepseek-official', model: 'deepseek-flash' },
    400, undefined, data => data)
  assert.deepEqual(value, { ready: true })
  assert.deepEqual(budgets, [400, 800, 1600])
})

test('自定义 Chat Completions 的 finish_reason=length 即使正文是合法 JSON 也必须重试', async () => {
  const budgets = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    budgets.push(JSON.parse(body).max_tokens)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ finish_reason: budgets.length === 1 ? 'length' : 'stop',
      message: { content: '{"complete":true}' } }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const value = await modelJson({}, 'session', 'system', 'prompt', {
      mode: 'custom', model: 'test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    }, 600, undefined, data => data)
    assert.deepEqual(value, { complete: true })
    assert.deepEqual(budgets, [600, 1200])
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('其他 dsh provider 不强制 DeepSeek 推理模式；输出一直截断时报告真实处理阶段', async () => {
  const optionsSeen = []
  const ctx = { llm: { async *stream(options) {
    optionsSeen.push(options)
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  } }, sessions: { get: id => ({ id, snapshotEvents: () => [] }) } }
  await assert.rejects(modelText(ctx, 'session', 'system', 'prompt', {
    mode: 'dsh', provider: 'another-provider', model: 'some-model',
  }, 100), /max-tokens/)
  assert.equal(optionsSeen[0].reasoningEffort, undefined)

  const root = await mkdtemp(join(tmpdir(), 'studio-budget-'))
  const studio = createStudioService(ctx, { dataRoot: root })
  try {
    const store = studio.storeFor('session')
    const sourceId = `sha256:${'1'.padStart(64, '0')}`
    store.addSource({ attachmentId: sourceId, bytes: 100, name: 'paper.pdf' })
    store.commitParsed(sourceId, { pageCount: 1, title: 'Test', figures: [],
      pages: [{ page: 1, text: 'Synthetic results and limitations. '.repeat(40) }] })
    const started = await studio.handle('generateOutline', { sessionId: 'session',
      sourceIds: [sourceId], prompt: '方法与局限' })
    assert.equal(started.ok, true)
    let job
    for (let attempt = 0; attempt < 40; attempt++) {
      job = (await studio.handle('getJob', { sessionId: 'session', jobId: started.value.id })).value
      if (job.state !== 'running') break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(job.state, 'failed')
    assert.match(job.phase, /逐篇摘要 1\/1/)
    assert.match(job.error, /max-tokens.*缩小生成范围/)
    assert.equal(store.getSummary(sourceId), null)
  } finally { await studio.shutdown() }
})
