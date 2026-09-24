import { execFile } from 'node:child_process'
import { access, open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sourceId } from './store.js'

const execFileAsync = promisify(execFile)
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export function pythonExecutable() {
  return process.env.STUDIO_PYTHON || join(PACKAGE_ROOT, '.venv', 'bin', 'python')
}

export async function parsePdf(path, output, id, options = {}) {
  const python = options.python || pythonExecutable()
  await access(python)
  const { stdout } = await execFileAsync(python, [
    join(PACKAGE_ROOT, 'worker', 'pdf_ingest.py'),
    '--input', path, '--output', output, '--source-id', id,
  ], { signal: options.signal, timeout: 5 * 60_000, maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(stdout)
}

export async function verifyPdf(ref, path) {
  sourceId(ref)
  const descriptor = await open(path, 'r')
  try {
    const prefix = Buffer.alloc(5)
    const { bytesRead } = await descriptor.read(prefix, 0, 5, 0)
    if (bytesRead !== 5 || prefix.toString('ascii') !== '%PDF-') {
      throw new Error('附件扩展名为 PDF，但内容并非有效 PDF')
    }
  } finally {
    await descriptor.close()
  }
}

export async function ingestAttachment(store, ref, path, options = {}) {
  const id = sourceId(ref)
  store.setSourceStatus(id, 'indexing')
  try {
    await verifyPdf(ref, path)
    const parsed = await parsePdf(path, store.directory, id, options)
    store.commitParsed(id, parsed)
    return store.getSource(id)
  } catch (error) {
    const message = error.stderr?.trim() || error.message || 'PDF 解析失败'
    store.setSourceStatus(id, 'error', String(message).slice(0, 400))
    throw error
  }
}
