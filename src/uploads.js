import { createHash, randomUUID } from 'node:crypto'
import { open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_FILE_BYTES } from './store.js'

const CHUNK_BYTES = 512 * 1024

export class StudioUploads {
  constructor() {
    this.active = new Map()
    this.cleaned = new Set()
  }

  async start(store, name, bytes) {
    if (typeof name !== 'string' || name.length > 180 || !/^[^/\\\0]+\.pdf$/i.test(name)) {
      throw new Error('只支持文件名安全的 PDF 文献')
    }
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes >= MAX_FILE_BYTES) {
      throw new Error('单篇 PDF 必须小于 30 MB，且不能为空')
    }
    for (const upload of [...this.active.values()]) {
      if (upload.sessionId === store.sessionId) await this.cancel(store, upload.id)
    }
    const directory = join(store.directory, 'uploads')
    if (!this.cleaned.has(directory)) {
      for (const file of await readdir(directory)) {
        if (/^[0-9a-f-]{36}\.part$/.test(file)) await rm(join(directory, file), { force: true })
      }
      this.cleaned.add(directory)
    }
    const id = randomUUID()
    const path = join(directory, `${id}.part`)
    const handle = await open(path, 'wx', 0o600)
    this.active.set(id, { sessionId: store.sessionId, id, path, handle, name, bytes,
      offset: 0, digest: createHash('sha256') })
    return { uploadId: id, chunkBytes: CHUNK_BYTES }
  }

  upload(store, id) {
    const upload = this.active.get(id)
    if (!upload || upload.sessionId !== store.sessionId) throw new Error('上传任务不存在或不属于该会话')
    return upload
  }

  async chunk(store, id, offset, data) {
    const upload = this.upload(store, id)
    if (!Number.isSafeInteger(offset) || offset !== upload.offset || typeof data !== 'string'
        || data.length > Math.ceil(CHUNK_BYTES / 3) * 4 + 4
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('上传分块或偏移量无效')
    const bytes = Buffer.from(data, 'base64')
    if (!bytes.length || bytes.length > CHUNK_BYTES || upload.offset + bytes.length > upload.bytes) {
      throw new Error('上传分块超过文件声明大小')
    }
    let written = 0
    while (written < bytes.length) {
      const result = await upload.handle.write(bytes, written, bytes.length - written, offset + written)
      written += result.bytesWritten
    }
    upload.digest.update(bytes)
    upload.offset += bytes.length
    return { received: upload.offset, total: upload.bytes }
  }

  async finish(store, id) {
    const upload = this.upload(store, id)
    if (upload.offset !== upload.bytes) throw new Error('上传未完成')
    this.active.delete(id)
    await upload.handle.close()
    const ref = { attachmentId: `sha256:${upload.digest.digest('hex')}`,
      bytes: upload.bytes, name: upload.name }
    const target = join(store.directory, 'sources', `${ref.attachmentId.slice(7)}.pdf`)
    try {
      const { added, source } = store.addSource(ref)
      if (!added && source.status === 'ready') return { added: false, source }
      await rename(upload.path, target)
      return { added: true, source: store.getSource(ref.attachmentId), path: target, ref }
    } finally {
      await rm(upload.path, { force: true })
    }
  }

  async cancel(store, id) {
    const upload = this.upload(store, id)
    this.active.delete(id)
    await upload.handle.close()
    await rm(upload.path, { force: true })
  }

  async close() {
    for (const upload of this.active.values()) {
      await upload.handle.close()
      await rm(upload.path, { force: true })
    }
    this.active.clear()
  }
}
