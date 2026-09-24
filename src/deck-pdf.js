import { randomUUID } from 'node:crypto'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { selectedSources } from './context.js'
import { writePdf } from './pdf.js'

const COLORS = { ink: '#172B42', accent: '#176F7A', muted: '#62748A',
  panel: '#F5F8FC', border: '#D7E2EA' }

function text(doc, value, x, y, width, height, size = 12, color = COLORS.ink) {
  doc.font('studio').fontSize(size).fillColor(color).text(value, x, y,
    { width, height, ellipsis: true })
}

function contained(doc, file, box) {
  doc.image(file, box.x, box.y, { fit: [box.w, box.h],
    align: 'center', valign: 'center' })
}

export async function writeDeckPdf(store, record, generated, deck) {
  const sources = new Map(selectedSources(store, record.data.sourceIds)
    .map((source, index) => [source.id, { ...source, number: index + 1 }]))
  const figures = new Map(store.figures().filter(figure => sources.has(figure.source_id))
    .map(figure => [figure.id, figure]))
  const output = join(store.directory, 'decks', `${deck.id}.pdf`)
  const staging = join(store.directory, 'decks', `.deck-pdf-${randomUUID()}.pdf`)
  try {
    await writePdf(staging, { size: [960, 540], margin: 0 }, doc => {
    record.data.slides.forEach((slide, index) => {
      doc.addPage()
      doc.rect(0, 0, 960, 540).fill(COLORS.panel)
      doc.rect(0, 0, 960, 10).fill(COLORS.accent)
      text(doc, slide.title, 48, 34, 860, 52, 26)
      doc.moveTo(48, 92).lineTo(912, 92).stroke(COLORS.border)
      doc.roundedRect(48, 116, 465, 345, 12).fill('#FFFFFF')
      if (index === 0 && !slide.points.length) {
        text(doc, record.data.title, 68, 195, 420, 150, 31)
        text(doc, `汇总 ${sources.size} 篇文献 · 溯源至 PDF 页码`, 68, 377,
          420, 32, 14, COLORS.accent)
      } else {
        const offset = slide.takeaway ? 67 : 0
        if (slide.takeaway) {
          text(doc, '核心结论', 70, 131, 110, 18, 9, COLORS.accent)
          text(doc, slide.takeaway.text, 70, 153, 416, 48, 15)
        }
        const gap = (305 - offset) / Math.max(slide.points.length, 1)
        slide.points.forEach((point, pointIndex) => {
          doc.circle(75, 143 + offset + gap * pointIndex + 9, 4).fill(COLORS.accent)
          text(doc, point.text, 94, 139 + offset + gap * pointIndex, 387, gap - 12,
            slide.points.length > 3 ? 12 : 14)
        })
      }
      if (slide.visualKind === 'paper') {
        const figure = figures.get(slide.figureId)
        if (!figure) throw new Error('文献原图已失效，不能生成 PDF')
        contained(doc, join(store.directory, figure.path), { x: 548, y: 122, w: 357, h: 285 })
        text(doc, `[${sources.get(figure.source_id).number}] PDF p.${figure.page} · ${slide.visualCaption || figure.caption}`,
          548, 414, 355, 42, 10, COLORS.muted)
      } else if (slide.visualKind === 'generated') {
        const asset = generated.get(index)
        if (!asset) throw new Error('AI 示意图缺失，不能生成 PDF')
        contained(doc, asset.path, { x: 548, y: 122, w: 357, h: 285 })
        text(doc, `AI 示意图 · 非实验结果 · ${slide.visualCaption || slide.title}`, 548, 414, 355, 38, 10, COLORS.muted)
      } else if (slide.visualKind === 'flow') {
        const nodes = slide.flowNodes.length ? slide.flowNodes : [slide.title]
        const gap = Math.min(70, 290 / nodes.length)
        nodes.forEach((node, nodeIndex) => {
          const y = 130 + nodeIndex * gap
          doc.roundedRect(582, y, 290, 51, 8).fill(nodeIndex % 2 ? '#FFFFFF' : '#DDEBF1')
          doc.roundedRect(582, y, 290, 51, 8).stroke(COLORS.accent)
          text(doc, node, 599, y + 9, 255, 36, 13)
          if (nodeIndex + 1 < nodes.length) text(doc, '↓', 725, y + 51, 30, 19, 12, COLORS.accent)
        })
        text(doc, `流程概念图 · ${slide.visualCaption || slide.title}`, 590, 430, 280, 30, 9, COLORS.muted)
      } else {
        const cols = [552, 646, 820]
        const widths = [90, 168, 79]
        const header = ['文献', '结论', '页码']
        doc.rect(546, 126, 357, 45).fill('#DDEBF1')
        header.forEach((value, cell) => text(doc, value, cols[cell], 138, widths[cell], 25, 11))
        slide.points.forEach((point, row) => {
          const evidence = store.evidence(point.evidenceIds[0])
          const source = sources.get(evidence.sourceId)
          const y = 171 + row * 63
          doc.rect(546, y, 357, 63).stroke(COLORS.border)
          ;[`[${source.number}] ${source.title || source.name}`, point.text,
            `p.${evidence.page}`].forEach((value, cell) =>
            text(doc, value, cols[cell], y + 7, widths[cell], 50, 9))
        })
        text(doc, '可编辑证据对照表', 560, 435, 330, 25, 10, COLORS.muted)
      }
      const claims = [slide.takeaway, ...slide.points].filter(Boolean)
      const refs = [...new Set(claims.flatMap(point => point.evidenceIds).map(id => {
        const row = store.evidence(id)
        if (!row || !sources.has(row.sourceId)) throw new Error('幻灯片引用已失效')
        return `[${sources.get(row.sourceId).number}] PDF p.${row.page}`
      }).concat(claims.flatMap(point => point.webIds || []).map(id => `[${id}] 网络`)))]
      text(doc, refs.join(' · '), 52, 486, 700, 24, 8, COLORS.muted)
      text(doc, `${String(index + 1).padStart(2, '0')} / 15 · Notebook Studio`,
        764, 486, 145, 24, 8, COLORS.muted)
    })
    doc.addPage()
    doc.rect(0, 0, 960, 540).fill(COLORS.panel)
    doc.rect(0, 0, 960, 10).fill(COLORS.accent)
    text(doc, '参考文献', 48, 34, 855, 52, 26)
    const all = [...sources.values(), ...(record.data.webSources || []).map(source => ({ ...source,
      online: true }))]
    const middle = Math.ceil(all.length / 2)
    all.forEach((source, index) => {
      const column = index >= middle ? 1 : 0
      const row = column ? index - middle : index
      text(doc, source.online ? `[${source.id}] 网络 · ${source.title} · ${source.url}`
        : `[${source.number}] ${source.title || source.name}`, 52 + column * 455,
      110 + row * 20, 427, 18, 8.5)
    })
    text(doc, '15 / 15 · Notebook Studio', 764, 486, 145, 24, 8, COLORS.muted)
    })
    await rename(staging, output)
  } finally {
    await rm(staging, { force: true })
  }
  store.saveDeckPdf(deck.id, output)
  return store.deck(deck.id)
}
