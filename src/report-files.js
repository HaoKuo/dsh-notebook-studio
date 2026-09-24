import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun,
  Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun,
  WidthType } from 'docx'
import { selectedSources } from './context.js'
import { writePdf } from './pdf.js'

const COLORS = { ink: '172B42', accent: '176F7A', muted: '607188', line: 'D7E2EA' }

function sourcesFor(store, sourceIds) {
  return new Map(selectedSources(store, sourceIds)
    .map((source, index) => [source.id, { ...source, number: index + 1 }]))
}

function citations(store, ids, sources, webIds = []) {
  return [...new Set(ids.map(id => {
    const evidence = store.evidence(id)
    if (!evidence || !sources.has(evidence.sourceId)) throw new Error('报告引用已失效')
    return `[${sources.get(evidence.sourceId).number}] PDF p.${evidence.page}`
  }).concat(webIds.map(id => `[${id}] 网络背景`)))].join(' · ')
}

function para(text, extras = {}) {
  return new Paragraph({ spacing: { after: 140, line: 325 },
    children: [new TextRun({ text, font: 'Arial Unicode MS', size: 21, color: COLORS.ink })],
    ...extras })
}

function claimParagraph(store, item, sources) {
  return new Paragraph({ spacing: { after: 180, line: 345 },
    children: [new TextRun({ text: item.text, font: 'Arial Unicode MS', size: 21,
    color: COLORS.ink }), new TextRun({ text: `  ${citations(store, item.evidenceIds, sources, item.webIds)}`,
      font: 'Arial Unicode MS', size: 16, color: COLORS.accent })] })
}

function evidenceTable(store, data, sources) {
  const cell = text => new TableCell({ children: [para(text)], margins: { top: 110,
    bottom: 90, left: 130, right: 130 } })
  const rows = [new TableRow({ children: ['文献', '关键结论', '证据页码'].map(cell),
    tableHeader: true })]
  for (const row of data.tableRows) {
    rows.push(new TableRow({ children: [cell(sources.get(row.sourceId)?.title
      || sources.get(row.sourceId)?.name || '未知文献'), cell(row.finding),
    cell(citations(store, row.evidenceIds, sources))] }))
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line } } })
}

function sectionRows(store, section) {
  return section.paragraphs.map(item => ({ sourceId: store.evidence(item.evidenceIds[0]).sourceId,
    finding: item.text, evidenceIds: item.evidenceIds }))
}

function visualFigure(store, visual, sources) {
  return store.figures().find(figure => figure.id === visual.figureId && sources.has(figure.source_id))
}

async function visualDocx(store, section, visual, asset, sources, number) {
  const label = `${visual.type === 'table' ? '表' : '图'} ${number} · ${visual.caption}`
  const result = [para(label, { keepNext: true })]
  if (visual.type === 'flow') {
    result.push(new Table({ rows: [new TableRow({ children: visual.nodes.map((node, index) =>
      new TableCell({ children: [para(`${index + 1}. ${node}`)],
        shading: { fill: index % 2 ? 'E9F3F4' : 'F4F8FA' },
        margins: { top: 120, bottom: 120, left: 90, right: 90 } })) })],
    width: { size: 100, type: WidthType.PERCENTAGE } }),
    para('概念流程 · 依据本节文献归纳，可编辑'))
  } else if (visual.type === 'table') {
    result.push(evidenceTable(store, { tableRows: sectionRows(store, section) }, sources))
  } else {
    const figure = visualFigure(store, visual, sources)
    if (visual.type === 'paper' && !figure || visual.type === 'generated' && !asset) {
      throw new Error('章节插图缺失，无法排版报告')
    }
    const file = figure ? join(store.directory, figure.path) : asset.path
    const ratio = figure ? figure.width / figure.height : 1
    const width = Math.round(Math.min(480, 340 * ratio))
    const caption = figure
      ? `[${sources.get(figure.source_id).number}] PDF p.${figure.page} · ${figure.caption}`
      : `AI 概念示意图 · ${asset.model} · 非论文原始实验结果`
    result.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true,
      children: [new ImageRun({ data: await readFile(file), type: 'png',
        transformation: { width, height: Math.round(width / ratio) },
        altText: { title: visual.caption, description: caption, name: figure?.id || asset.key } })] }), para(caption))
  }
  return result
}

async function reportDocx(store, data, generated, sources) {
  const children = [new Paragraph({ heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: data.title, font: 'Arial Unicode MS',
      bold: true, size: 38, color: COLORS.ink })] }),
  para(`Notebook Studio · ${sources.size} 篇文献 · PDF 原文页码可追溯`),
  new Paragraph({ text: '执行摘要', heading: HeadingLevel.HEADING_1 })]
  for (const item of data.overview) children.push(claimParagraph(store, item, sources))
  let visualNumber = 0
  for (const [sectionIndex, section] of data.sections.entries()) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 150 } }))
    for (const item of section.paragraphs) children.push(claimParagraph(store, item, sources))
    for (const [visualIndex, visual] of section.visuals.entries()) {
      children.push(...await visualDocx(store, section, visual,
        generated.get(`${sectionIndex}:${visualIndex}`), sources, ++visualNumber))
    }
  }
  children.push(new Paragraph({ text: '跨文献证据对照', heading: HeadingLevel.HEADING_1 }))
  children.push(evidenceTable(store, data, sources))
  children.push(new Paragraph({ text: '参考文献', heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true }))
  for (const source of sources.values()) {
    children.push(para(`[${source.number}] ${source.title || source.name} · ${source.doi || '无 DOI'} · ${source.id}`))
  }
  if (data.webSources.length) {
    children.push(new Paragraph({ text: '网络参考（仅供背景，不是论文证据）', heading: HeadingLevel.HEADING_1 }))
    for (const item of data.webSources) {
      children.push(para(`[${item.id}] ${item.title} · ${item.url} · 检索于 ${item.searchedAt}`))
    }
  }
  const document = new Document({ creator: 'dsh Notebook Studio',
    styles: { default: { document: { run: { font: 'Arial Unicode MS', size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1050, bottom: 1050,
      left: 1050, right: 1050 } } }, children,
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun('Notebook Studio · '), new TextRun({ children: [PageNumber.CURRENT] })] })] }) } }] })
  return Packer.toBuffer(document)
}

async function reportPdf(path, store, data, generated, sources) {
  const margin = 48
  const maxY = 770
  await writePdf(path, { size: 'A4', margin: 0 }, doc => {
    let cursor = 0
    let page = 0
    function nextPage() {
      doc.addPage()
      page++
      doc.rect(0, 0, 595, 7).fill(`#${COLORS.accent}`)
      doc.font('studio').fontSize(8).fillColor(`#${COLORS.muted}`)
        .text(`Notebook Studio · ${page}`, 425, 808, { width: 125, align: 'right' })
      cursor = 48
    }
    function room(height) { if (cursor + height > maxY) nextPage() }
    function heading(text, size = 17) {
      room(48)
      doc.font('studio').fontSize(size).fillColor(`#${COLORS.ink}`)
        .text(text, margin, cursor, { width: 499, height: 42 })
      cursor += 45
    }
    function paragraph(text, refs = '') {
      doc.font('studio').fontSize(11)
      const height = doc.heightOfString(text, { width: 499, lineGap: 4 })
      room(height + (refs ? 26 : 12))
      doc.font('studio').fontSize(11).fillColor(`#${COLORS.ink}`)
        .text(text, margin, cursor, { width: 499, lineGap: 4 })
      cursor += height + 5
      if (refs) {
        doc.fontSize(8).fillColor(`#${COLORS.accent}`).text(refs, margin, cursor,
          { width: 499, height: 17 })
        cursor += 22
      }
      cursor += 9
    }
    nextPage()
    heading(data.title, 23)
    paragraph(`Notebook Studio · ${sources.size} 篇文献 · 引用溯源至 PDF 原文页码`)
    heading('执行摘要')
    for (const item of data.overview) paragraph(item.text,
      citations(store, item.evidenceIds, sources, item.webIds))
    let visualNumber = 0
    for (const [sectionIndex, section] of data.sections.entries()) {
      heading(section.title)
      for (const item of section.paragraphs) paragraph(item.text,
        citations(store, item.evidenceIds, sources, item.webIds))
      for (const [visualIndex, visual] of section.visuals.entries()) {
        const label = `${visual.type === 'table' ? '表' : '图'} ${++visualNumber} · ${visual.caption}`
        const figure = visualFigure(store, visual, sources)
        const asset = generated.get(`${sectionIndex}:${visualIndex}`)
        const sourceCaption = figure
          ? `[${sources.get(figure.source_id).number}] PDF p.${figure.page} · ${figure.caption}`
          : `AI 概念示意图 · ${asset?.model || ''} · 非论文原始实验结果`
        const footer = visual.type === 'flow' ? '概念流程 · 依据本节文献归纳' : sourceCaption
        doc.font('studio').fontSize(11)
        const labelHeight = doc.heightOfString(label, { width: 499, lineGap: 4 }) + 14
        const footerHeight = doc.heightOfString(footer, { width: 499, lineGap: 4 }) + 14
        // 按实际图注长度预留整组空间，避免多图报告在页尾挤出边界。
        room(labelHeight + (visual.type === 'table' ? 80
          : (visual.type === 'flow' ? 112 : 279) + footerHeight))
        paragraph(label)
        if (visual.type === 'flow') {
          const width = (499 - (visual.nodes.length - 1) * 12) / visual.nodes.length
          visual.nodes.forEach((node, index) => {
            const position = margin + index * (width + 12)
            doc.roundedRect(position, cursor, width, 100, 9).fill('#E9F3F4')
            doc.font('studio').fontSize(9).fillColor(`#${COLORS.ink}`)
              .text(node, position + 8, cursor + 12, { width: width - 16, height: 80, align: 'center' })
            if (index + 1 < visual.nodes.length) doc.text('→', position + width, cursor + 40,
              { width: 12, align: 'center' })
          })
          cursor += 112
          paragraph(footer)
        } else if (visual.type === 'table') {
          drawTable(sectionRows(store, section))
        } else {
          if (visual.type === 'paper' && !figure || visual.type === 'generated' && !asset) {
            throw new Error('章节插图缺失，无法排版报告')
          }
          doc.image(figure ? join(store.directory, figure.path) : asset.path,
            margin, cursor, { fit: [499, 265], align: 'center', valign: 'center' })
          cursor += 279
          paragraph(sourceCaption)
        }
      }
    }
    heading('跨文献证据对照')
    drawTable(data.tableRows)
    function drawTable(rows) {
    const header = () => {
      room(36)
      doc.rect(margin, cursor, 499, 29).fill('#DDEBF1')
      doc.font('studio').fontSize(9).fillColor(`#${COLORS.ink}`)
        .text('文献', margin + 8, cursor + 8, { width: 126 })
        .text('关键结论', margin + 141, cursor + 8, { width: 214 })
        .text('来源', margin + 365, cursor + 8, { width: 126 })
      cursor += 29
    }
    header()
    for (const row of rows) {
      const source = sources.get(row.sourceId)
      const evidence = citations(store, row.evidenceIds, sources)
      doc.font('studio').fontSize(8.5)
      const height = Math.max(44, doc.heightOfString(row.finding, { width: 211 }) + 14,
        doc.heightOfString(source?.title || source?.name || '', { width: 126 }) + 14)
      if (cursor + height > maxY) { nextPage(); header() }
      doc.rect(margin, cursor, 499, height).stroke(`#${COLORS.line}`)
      doc.fillColor(`#${COLORS.ink}`).text(source?.title || source?.name || '',
        margin + 8, cursor + 7, { width: 126, height: height - 10, ellipsis: true })
        .text(row.finding, margin + 141, cursor + 7,
          { width: 211, height: height - 10, ellipsis: true })
        .text(evidence, margin + 365, cursor + 7,
          { width: 126, height: height - 10, ellipsis: true })
      cursor += height
    }
    cursor += 18
    }
    nextPage()
    heading('参考文献')
    for (const source of sources.values()) {
      paragraph(`[${source.number}] ${source.title || source.name} · ${source.doi || '无 DOI'} · ${source.id}`)
    }
    if (data.webSources.length) {
      heading('网络参考（仅供背景，不是论文证据）')
      for (const item of data.webSources) {
        paragraph(`[${item.id}] ${item.title} · ${item.url} · 检索于 ${item.searchedAt}`)
      }
    }
  })
}

export async function writeReportFiles(store, id, data, generated, signal) {
  const sources = sourcesFor(store, data.sourceIds)
  const manifest = { version: 3, sessionId: store.sessionId, reportId: id,
    prompt: data.prompt, sourceIds: data.sourceIds, webSources: data.webSources,
    sources: [...sources.values()].map(({ id: sourceId, name, title, doi, number }) =>
      ({ sourceId, name, title, doi, number })),
    claims: [...data.overview, ...data.sections.flatMap(section => section.paragraphs),
      ...data.tableRows.map(row => ({ text: row.finding, evidenceIds: row.evidenceIds }))]
      .map(item => ({ text: item.text, evidenceIds: item.evidenceIds,
        webCitations: (item.webIds || []).map(webId => ({ id: webId,
          url: data.webSources.find(source => source.id === webId)?.url })),
        citations: item.evidenceIds.map(evidenceId => {
          const row = store.evidence(evidenceId)
          return { evidenceId, sourceId: row.sourceId, page: row.page }
        }) })),
    visuals: data.sections.flatMap((section, sectionIndex) => section.visuals.map((visual, visualIndex) => {
      const figure = visualFigure(store, visual, sources)
      const asset = generated.get(`${sectionIndex}:${visualIndex}`)
      return { ...visual, section: sectionIndex + 1, sectionTitle: section.title,
        editable: ['flow', 'table'].includes(visual.type),
        ...(figure ? { sourceId: figure.source_id, page: figure.page, originalCaption: figure.caption } : {}),
        ...(asset ? { model: asset.model, assetKey: asset.key, evidence: false } : {}) }
    })) }
  const root = join(store.directory, 'reports')
  const path = join(root, `${id}.docx`)
  const pdf = join(root, `${id}.pdf`)
  const manifestPath = join(root, `${id}.sources.json`)
  const token = randomUUID()
  const staging = [join(root, `.${token}.docx`), join(root, `.${token}.pdf`),
    join(root, `.${token}.json`)]
  try {
    await writeFile(staging[0], await reportDocx(store, data, generated, sources),
      { flag: 'wx', mode: 0o600 })
    signal?.throwIfAborted()
    await reportPdf(staging[1], store, data, generated, sources)
    await writeFile(staging[2], JSON.stringify(manifest, null, 2),
      { flag: 'wx', mode: 0o600 })
    signal?.throwIfAborted()
    await rename(staging[0], path)
    await rename(staging[1], pdf)
    await rename(staging[2], manifestPath)
    return store.finishReport(id, path, pdf, manifestPath)
  } finally {
    await Promise.all(staging.map(file => rm(file, { force: true })))
  }
}
