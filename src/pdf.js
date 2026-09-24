import { createWriteStream } from 'node:fs'
import { access, rm } from 'node:fs/promises'
import PDFDocument from 'pdfkit'

const SYSTEM_FONTS = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf',
  '/usr/share/fonts/truetype/arphic/ukai.ttf',
]

export async function cjkFont() {
  const fonts = process.env.STUDIO_CJK_FONT ? [process.env.STUDIO_CJK_FONT] : SYSTEM_FONTS
  for (const path of fonts) {
    try { await access(path); return path } catch { /* 继续查找可用字体。 */ }
  }
  throw new Error('无法找到中文 PDF 字体，请设置 STUDIO_CJK_FONT 为可用的 TTF 字体路径')
}

export async function writePdf(path, options, draw) {
  const font = await cjkFont()
  const doc = new PDFDocument({ ...options, autoFirstPage: false, bufferPages: true,
    compress: true })
  const output = createWriteStream(path, { flags: 'wx', mode: 0o600 })
  const finished = new Promise((resolve, reject) => {
    output.once('finish', resolve)
    output.once('error', reject)
    doc.once('error', reject)
  })
  void finished.catch(() => {})
  try {
    doc.pipe(output)
    doc.registerFont('studio', font)
    if (!doc.font('studio')._font.font.hasGlyphForCodePoint('中'.codePointAt(0))) {
      throw new Error('指定的 PDF 字体不含中文字形，请设置 STUDIO_CJK_FONT')
    }
    await draw(doc)
    doc.end()
    await finished
  } catch (error) {
    doc.destroy()
    output.destroy()
    await rm(path, { force: true })
    throw error
  }
}
