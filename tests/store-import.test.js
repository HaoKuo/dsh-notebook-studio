import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { importBatch, importFile, readUploadManifest, sessionUploadRoot, uploadedBatches } from '../src/imports.js'
import { MAX_FILES, MAX_PROJECT_BYTES, StudioStore } from '../src/store.js'

function ref(index, bytes = 1) {
  return { attachmentId: `sha256:${index.toString(16).padStart(64, '0')}`, name: `${index}.pdf`, bytes }
}

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-studio-'))
  const good = join(cwd, 'good.pdf')
  const python = join(process.cwd(), '.venv', 'bin', 'python')
  const script = `import pymupdf,sys
doc=pymupdf.open(); page=doc.new_page(width=612,height=792)
for i in range(8): page.insert_text((45,500+i*14),'Evidence from this article supports research. '*3)
for x in (130,190,270,380): page.draw_rect(pymupdf.Rect(x,150,x+65,285),color=(0,0,0))
page.insert_text((140,345),'Fig. 1. A vector framework spans two columns')
doc.save(sys.argv[1])`
  const created = spawnSync(python, ['-c', script, good], { encoding: 'utf8' })
  assert.equal(created.status, 0, created.stderr)
  return { cwd, good }
}

test('同一会话的清单导入、逐篇错误、检索与去重', async () => {
  const { cwd, good } = await fixture()
  const session = { id: 'session-pdfs-1', header: { cwd } }
  const sendId = '2026-09-24T10-00-00-000Z-deadbeef'
  const root = join(sessionUploadRoot(session), sendId)
  await mkdir(root, { recursive: true })
  await copyFile(good, join(root, 'paper.pdf'))
  const invalid = Buffer.from('%PDF-not-a-valid-document')
  await writeFile(join(root, 'broken.pdf'), invalid)
  const paper = await readFile(good)
  await writeFile(join(root, '.dsh-paste-input.json'), JSON.stringify({
    owner: 'dsh-paste-input-plus', version: 1, sessionId: session.id,
    files: [{ originalPath: 'paper.pdf', actualPath: 'paper.pdf', size: paper.length },
      { originalPath: 'broken.pdf', actualPath: 'broken.pdf', size: invalid.length }],
  }))
  const event = { type: 'user/message', data: { source: { kind: 'user' }, content: [{
    type: 'text', text: `上传文件\n==== DSH_PASTE_INPUT_V1 ====\n${root}\n\nFiles: 2\nManifest: .dsh-paste-input.json\nAttached files (paths are relative to the root above):\n==== END DSH_PASTE_INPUT ====`,
  }] } }
  assert.deepEqual(uploadedBatches(event), [root])
  const store = new StudioStore(session.id, join(cwd, 'studio'))
  try {
    const manifest = await readUploadManifest(session, root)
    assert.equal(manifest.files.length, 2)
    await importBatch(store, session, root)
    assert.equal(store.importState(sendId), 'complete')
    const rows = store.listSources()
    assert.equal(rows.length, 2)
    const ready = rows.find(row => row.status === 'ready')
    assert.ok(ready, JSON.stringify(rows))
    assert.ok(ready.figure_count > 0)
    assert.equal(rows.find(row => row.status === 'error').name, 'broken.pdf')
    assert.equal(store.search('evidence')[0].page, 1)
    assert.equal(ready.id, `sha256:${createHash('sha256').update(paper).digest('hex')}`)
    await importBatch(store, session, root)
    assert.equal(store.listSources().length, 2)
    assert.ok(store.evidence(store.search('evidence')[0].evidenceId))
  } finally {
    store.close()
  }
})

test('拒绝伪造路径、越界文件和错误的会话所有权', async () => {
  const { cwd, good } = await fixture()
  const session = { id: 'session-security', header: { cwd } }
  const root = join(sessionUploadRoot(session), '2026-09-24T10-00-00-000Z-cafebabe')
  await mkdir(root, { recursive: true })
  await assert.rejects(readUploadManifest(session, good), /目录与当前会话不符/)
  await writeFile(join(root, '.dsh-paste-input.json'), JSON.stringify({
    owner: 'other', version: 1, sessionId: session.id, files: [],
  }))
  await assert.rejects(readUploadManifest(session, root), /所有权/)
  const store = new StudioStore(session.id, join(cwd, 'studio'))
  try {
    await symlink(good, join(root, 'escape.pdf'))
    await assert.rejects(importFile(store, { root }, {
      actualPath: 'escape.pdf', size: (await readFile(good)).length,
    }), /不属于该清单/)
    await assert.rejects(importFile(store, { root }, { actualPath: '../secret.pdf', size: 1 }), /不安全/)
  } finally {
    store.close()
  }
})

test('30 篇和单篇严格小于 30 MB、崩溃后重排', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-studio-store-'))
  const store = new StudioStore('limits', root)
  for (let index = 1; index <= MAX_FILES; index++) store.addSource(ref(index))
  assert.throws(() => store.addSource(ref(31)), /最多导入/)
  store.setSourceStatus(ref(1).attachmentId, 'indexing')
  store.createJob('job-1', 'import', '解析')
  store.setImportState('send-1', 'running')
  store.close()
  const resumed = new StudioStore('limits', root)
  assert.equal(resumed.getSource(ref(1).attachmentId).status, 'queued')
  assert.equal(resumed.getJob('job-1').state, 'interrupted')
  assert.equal(resumed.importState('send-1'), 'pending')
  resumed.close()
  const limited = new StudioStore('bytes', root)
  try {
    assert.throws(() => limited.addSource(ref(1, 30_000_000)), /小于 30 MB/)
    for (let index = 1; index <= 30; index++) limited.addSource(ref(index, 29_999_999))
    assert.equal(MAX_PROJECT_BYTES, 30 * 29_999_999)
    assert.equal(limited.listSources().length, 30)
  } finally {
    limited.close()
  }
})
