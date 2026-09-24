import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ingestAttachment } from './ingest.js'
import { MAX_FILE_BYTES } from './store.js'

const START = '==== DSH_PASTE_INPUT_V1 ===='
const END = '==== END DSH_PASTE_INPUT ===='
const OWNER = '.dsh-paste-input.json'

export function sessionUploadRoot(session) {
  const cwd = session?.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error('当前会话没有可用工作区')
  const id = String(session.id)
  const slug = id.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 48) || 'session'
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 12)
  return resolve(cwd, '.dsh', 'tmp', 'attachments', `${slug}-${hash}`)
}

export function uploadedBatches(event) {
  if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') return []
  const text = (event.data.content || []).filter(block => block.type === 'text')
    .map(block => block.text).join('\n')
  const batches = []
  for (const segment of text.split(START).slice(1)) {
    if (!segment.includes(END)) continue
    const lines = segment.slice(0, segment.indexOf(END)).trim().split(/\r?\n/)
      .map(line => line.trim()).filter(Boolean)
    if (lines[0] && lines.includes(`Manifest: ${OWNER}`)) batches.push(lines[0])
  }
  return batches
}

function inside(root, file) {
  const path = relative(root, file)
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

function safeRelativePath(path) {
  if (typeof path !== 'string' || path.length > 300 || path.includes('\\')
      || path.split('/').some(part => !part || part === '.' || part === '..'
        || part.includes('\0'))) throw new Error('附件清单含不安全的相对路径')
  return path
}

export async function readUploadManifest(session, claimedRoot) {
  const parent = sessionUploadRoot(session)
  const sendId = basename(claimedRoot)
  if (!/^[A-Za-z0-9-]{16,64}$/.test(sendId) || claimedRoot !== join(parent, sendId)) {
    throw new Error('附件清单的目录与当前会话不符')
  }
  const parentReal = await realpath(parent)
  const root = await realpath(claimedRoot)
  if (!inside(parentReal, root) || !(await lstat(root)).isDirectory()) {
    throw new Error('附件目录不在当前会话工作区内')
  }
  const manifestFile = join(root, OWNER)
  const marker = await lstat(manifestFile)
  if (!marker.isFile() || marker.size > 256 * 1024) throw new Error('附件清单无效或过大')
  const data = JSON.parse(await readFile(manifestFile, 'utf8'))
  if (data?.owner !== 'dsh-paste-input-plus' || data.version !== 1
      || data.sessionId !== String(session.id) || !Array.isArray(data.files)) {
    throw new Error('附件清单缺少有效的会话所有权信息')
  }
  return { sendId, root, files: data.files }
}

async function copyAndHash(file, output, signal) {
  const staging = join(output, `.import-${randomUUID()}.pdf`)
  const digest = createHash('sha256')
  let bytes = 0
  try {
    await pipeline(createReadStream(file), new Transform({
      transform(chunk, _, callback) {
        bytes += chunk.length
        if (bytes >= MAX_FILE_BYTES) return callback(new Error('单篇 PDF 必须小于 30 MB'))
        digest.update(chunk)
        callback(null, chunk)
      },
    }), createWriteStream(staging, { flags: 'wx', mode: 0o600 }), { signal })
    if (!bytes) throw new Error('空 PDF 不可导入')
    const hash = digest.digest('hex')
    return { staging, ref: { attachmentId: `sha256:${hash}`, bytes } }
  } catch (error) {
    await rm(staging, { force: true })
    throw error
  }
}

export async function importFile(store, upload, entry, signal) {
  const actualPath = safeRelativePath(entry.actualPath)
  const name = basename(safeRelativePath(entry.originalPath || actualPath))
  if (!name.toLowerCase().endsWith('.pdf')) throw new Error('仅支持 PDF 文献')
  if (!Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size >= MAX_FILE_BYTES) {
    throw new Error('单篇 PDF 必须小于 30 MB，且不能为空')
  }
  const path = join(upload.root, ...actualPath.split('/'))
  const real = await realpath(path)
  const metadata = await lstat(path)
  if (!inside(upload.root, real) || !metadata.isFile() || (await stat(real)).size !== entry.size) {
    throw new Error('附件文件不属于该清单，或上传后被修改')
  }
  const { staging, ref } = await copyAndHash(real, join(store.directory, 'sources'), signal)
  ref.name = name
  const target = join(store.directory, 'sources', `${ref.attachmentId.slice(7)}.pdf`)
  try {
    const { source } = store.addSource(ref)
    if (source.status === 'ready') return source
    await rename(staging, target)
    await ingestAttachment(store, ref, target, { signal })
    return store.getSource(source.id)
  } finally {
    await rm(staging, { force: true })
  }
}

export async function importBatch(store, session, claimedRoot, progress = () => {}, signal) {
  const { sendId, root, files } = await readUploadManifest(session, claimedRoot)
  if (store.importState(sendId) === 'complete') return
  store.setImportState(sendId, 'running')
  const pdfs = files.filter(entry => typeof entry.actualPath === 'string'
    && entry.actualPath.toLowerCase().endsWith('.pdf'))
  if (!pdfs.length) store.addImportError(sendId, '附件', '这批上传没有 PDF 文件')
  for (const [index, entry] of pdfs.entries()) {
    signal?.throwIfAborted()
    const name = String(entry.originalPath || entry.actualPath).slice(0, 180)
    progress(`解析与索引 ${index + 1}/${pdfs.length}：${name}`)
    try {
      await importFile(store, { root }, entry, signal)
    } catch (error) {
      if (!store.listSources().some(source => source.name === basename(name) && source.status === 'error')) {
        store.addImportError(sendId, name, error.message)
      }
    }
  }
  store.setImportState(sendId, 'complete')
}
