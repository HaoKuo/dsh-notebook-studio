import { execFile } from 'node:child_process'
import { open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sourceId } from './store.js'

const execFileAsync = promisify(execFile)
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const INSTALL_HINT = '请在插件目录执行 python3 -m venv .venv && .venv/bin/pip install -r requirements.txt（PyMuPDF），或用 STUDIO_PYTHON 指向已安装 PyMuPDF 的解释器'

/** 包内虚拟环境：源码树与 git/npm 安装都以它为默认。 */
function packageVenv() {
  return process.platform === 'win32'
    ? join(PACKAGE_ROOT, '.venv', 'Scripts', 'python.exe')
    : join(PACKAGE_ROOT, '.venv', 'bin', 'python')
}

/** 只接受能 import pymupdf 的解释器，避免把缺依赖的解释器当成可用。 */
async function usablePython(candidate) {
  try {
    await execFileAsync(candidate, ['-c', 'import pymupdf'], { timeout: 30_000 })
    return true
  } catch {
    return false
  }
}

/**
 * 解析可用的 Python 解释器：STUDIO_PYTHON 显式设置时必须可用，
 * 否则依次尝试包内 .venv 与 PATH 上的 python3／python。
 * git/npm 安装不带 .venv，回退链与明确报错决定能否开箱解析 PDF。
 */
export async function pythonExecutable() {
  const explicit = process.env.STUDIO_PYTHON
  if (explicit) {
    if (await usablePython(explicit)) return explicit
    throw new Error(`STUDIO_PYTHON 指向的解释器不可用（缺少 PyMuPDF）：${explicit}；${INSTALL_HINT}`)
  }
  const tried = []
  for (const candidate of [packageVenv(), 'python3', 'python']) {
    if (await usablePython(candidate)) return candidate
    tried.push(candidate)
  }
  throw new Error(`没有可用的 Python + PyMuPDF 解释器，已尝试：${tried.join('、')}；${INSTALL_HINT}`)
}

export async function parsePdf(path, output, id, options = {}) {
  const python = options.python || await pythonExecutable()
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
