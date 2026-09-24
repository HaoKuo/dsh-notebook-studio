import { createHash } from 'node:crypto'
import { chmod, copyFile, lstat, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'

const publishing = new Map()

async function publish(store, session, kind, item) {
  const cwd = session?.header?.cwd
  if (!isAbsolute(cwd || '')) throw new Error('当前会话没有工作区路径；成稿仍可下载和预览')
  const sourcePaths = [kind === 'report' ? item.docx_path : item.path, item.pdf_path, item.manifest_path]
  if (sourcePaths.some(path => !path)) return null
  const metadata = await Promise.all(sourcePaths.map(path => stat(path)))
  const fingerprint = createHash('sha256').update(JSON.stringify(metadata.map(info =>
    [info.size, info.mtimeMs]))).digest('hex')
  const previous = store.getExport(kind, item.id)
  if (previous?.fingerprint === fingerprint) {
    try {
      await Promise.all([previous.officePath, previous.pdfPath, previous.manifestPath].map(path => stat(path)))
      return previous
    } catch { /* 工作区副本被删除时可从内部成稿重新导出。 */ }
  }
  let parent = await realpath(cwd)
  for (const name of ['notebook-studio', basename(store.directory)]) {
    parent = join(parent, name)
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const info = await lstat(parent)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('成稿输出目录不能是符号链接')
  }
  // 每次重排使用新目录，保留用户已修改的旧成稿。
  const directory = await mkdtemp(join(parent, `${kind}-`))
  const title = String(item.data?.title || (kind === 'report' ? '图文报告' : '演示文稿'))
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 70) || kind
  const officePath = join(directory, `${title}.${kind === 'report' ? 'docx' : 'pptx'}`)
  const pdfPath = join(directory, `${title}.pdf`)
  const manifestPath = join(directory, `${title}.sources.json`)
  try {
    for (const [index, target] of [officePath, pdfPath, manifestPath].entries()) {
      await copyFile(sourcePaths[index], target)
      await chmod(target, 0o600)
    }
    const result = { directory, officePath, pdfPath, manifestPath, fingerprint }
    store.saveExport(kind, item.id, result)
    return result
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function publishArtifact(store, session, kind, item) {
  if (!item) return null
  const key = `${store.directory}:${kind}:${item.id}`
  if (publishing.has(key)) return publishing.get(key)
  const pending = publish(store, session, kind, item).finally(() => publishing.delete(key))
  publishing.set(key, pending)
  return pending
}
