import { randomUUID } from 'node:crypto'
import { rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import PptxGenJS from 'pptxgenjs'
import { selectedSources } from './context.js'
import { validateOutline } from './model.js'

const W = 13.333
const H = 7.5
const C = {
  paper: 'F5F8FC', ink: '172B42', muted: '62748A', accent: '176F7A',
  blue: 'DDEBF1', white: 'FFFFFF', line: 'D7E2EA', warm: 'FFF2DB',
}

function addText(slide, text, box, options = {}) {
  slide.addText(text, { ...box, fontFace: 'PingFang SC', color: C.ink,
    margin: 0, breakLine: false, fit: 'shrink', valign: 'mid',
    ...options })
}

function captionPreview(value) {
  const text = value.replace(/\s+/g, ' ')
  return text.length > 85 ? `${text.slice(0, 84).trimEnd()}…` : text
}

function addBase(pptx, slide, title, number) {
  slide.background = { color: C.paper }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.13,
    line: { color: C.accent, transparency: 100 }, fill: { color: C.accent } })
  addText(slide, title, { x: 0.67, y: 0.42, w: 12.0, h: 0.72 },
    { fontSize: 26, bold: true, color: C.ink })
  slide.addShape(pptx.ShapeType.line, { x: 0.67, y: 1.28, w: 12.0, h: 0,
    line: { color: C.line, width: 1 } })
  addText(slide, `${String(number).padStart(2, '0')} / 15 · Notebook Studio`,
    { x: 10.2, y: 7.12, w: 2.45, h: 0.22 },
    { fontSize: 8.7, align: 'right', color: C.muted })
}

function putContainedImage(slide, file, image, bounds, caption) {
  const ratio = image.width / image.height
  const height = Math.min(bounds.h, bounds.w / ratio)
  const width = Math.min(bounds.w, height * ratio)
  slide.addImage({ path: file, x: bounds.x + (bounds.w - width) / 2,
    y: bounds.y + (bounds.h - height) / 2, w: width, h: height,
    altText: caption })
}

function renderFlow(pptx, slide, nodes, caption) {
  const labels = nodes.length ? nodes.slice(0, 5) : ['问题', '方法', '验证']
  const gap = labels.length < 5 ? 1.04 : 0.89
  const start = labels.length < 5 ? 2.05 : 1.78
  for (const [index, label] of labels.entries()) {
    const y = start + index * gap
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 8.17, y, w: 3.76, h: 0.66, rectRadius: 0.09,
      line: { color: C.accent, width: 1.3 }, fill: { color: index % 2 ? C.white : C.blue },
    })
    addText(slide, label, { x: 8.32, y: y + 0.11, w: 3.46, h: 0.45 },
      { fontSize: 16, align: 'center', bold: true })
    if (index + 1 < labels.length) {
      slide.addShape(pptx.ShapeType.line, { x: 10.05, y: y + 0.69, w: 0, h: gap - 0.73,
        line: { color: C.accent, width: 2, endArrowType: 'triangle' } })
    }
  }
  addText(slide, captionPreview(`可编辑流程图 · ${caption || '对文献内容的概括'}`),
    { x: 7.6, y: 6.25, w: 4.9, h: 0.36 },
    { fontSize: 10.5, align: 'center', color: C.muted })
}

function renderEvidenceTable(slide, store, item, sources) {
  const rows = [['文献', '可核实结论', 'PDF 页码'], ...item.points.map(point => {
    const evidence = store.evidence(point.evidenceIds[0])
    const source = sources.get(evidence.sourceId)
    return [`[${source.number}] ${source.title || source.name}`,
      point.text, `p.${evidence.page}`]
  })]
  slide.addTable(rows, { x: 7.57, y: 1.74, w: 4.9, h: 3.93,
    colW: [1.5, 2.6, 0.8], rowH: 0.78, margin: 0.09,
    fontFace: 'PingFang SC', fontSize: 10, color: C.ink,
    border: { type: 'solid', color: C.line, pt: 0.7 },
    fill: C.white, valign: 'mid',
    autoFit: false, bold: false })
  addText(slide, captionPreview(`可编辑证据对照 · ${item.visualCaption || '全部结论可回溯至 PDF 页码'}`),
    { x: 7.6, y: 6.25, w: 4.9, h: 0.4 }, { fontSize: 10, color: C.muted })
  return rows
}

function citations(store, points, sources, webSources) {
  const ids = [...new Set(points.flatMap(point => point.evidenceIds))]
  const rows = ids.map(id => {
    const evidence = store.evidence(id)
    if (!evidence || !sources.has(evidence.sourceId)) throw new Error(`引用 ${id} 已失效，无法导出`)
    return { ...evidence, number: sources.get(evidence.sourceId).number }
  })
  const web = new Map(webSources.map(source => [source.id, source]))
  const online = [...new Set(points.flatMap(point => point.webIds || []))].map(id => {
    const item = web.get(id)
    if (!item) throw new Error(`网络引用 ${id} 已失效`)
    return item
  })
  const short = [...new Set(rows.map(row => `[${row.number}] PDF p.${row.page}`)),
    ...online.map(item => `[${item.id}] 网络`)].join(' · ')
  return { rows, online, short }
}

function addNotes(slide, rows, online, visual, item) {
  const claims = rows.map(row => `${row.evidenceId} | [${row.number}] ${row.title || row.name}, PDF p.${row.page}\n${row.excerpt.slice(0, 950)}`)
  const network = online.map(source => `[${source.id}] ${source.title}\n${source.url}\n检索：${source.searchedAt}\n${source.snippet}`)
  slide.addNotes(['本页讲述：', item.speakerNotes || '请依据以下证据讲述。',
    '资料与页码：', ...claims, '网络背景（非论文证据）：', ...network,
    '视觉素材：', JSON.stringify(visual, null, 2)].join('\n\n'))
}

function renderPoints(pptx, slide, points, refs, takeaway) {
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.67, y: 1.6, w: 6.52, h: 4.91,
    rectRadius: 0.12, line: { color: C.line }, fill: { color: C.white } })
  const offset = takeaway ? 0.98 : 0
  if (takeaway) {
    addText(slide, '核心结论', { x: 0.98, y: 1.82, w: 1.1, h: 0.27 },
      { fontSize: 10, bold: true, color: C.accent })
    addText(slide, takeaway.text, { x: 0.98, y: 2.1, w: 5.82, h: 0.57 },
      { fontSize: 16, bold: true, color: C.ink, valign: 'top' })
  }
  const space = (4.35 - offset) / Math.max(points.length, 1)
  for (const [index, point] of points.entries()) {
    const y = 1.91 + offset + index * space
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.97, y: y + 0.13, w: 0.12, h: 0.12,
      line: { color: C.accent, transparency: 100 }, fill: { color: C.accent } })
    addText(slide, point.text, { x: 1.23, y, w: 5.62, h: Math.max(0.48, space - 0.22) },
      { fontSize: points.length === 4 ? 14 : 16, valign: 'top' })
  }
  addText(slide, refs || '证据不足', { x: 0.72, y: 6.79, w: 11.1, h: 0.25 },
    { fontSize: 9, color: C.muted })
}

function renderReferences(pptx, sources, webSources) {
  const slide = pptx.addSlide()
  addBase(pptx, slide, '参考文献', 15)
  const items = [...sources.values(), ...webSources.map(source => ({ ...source, online: true }))]
  slide.addNotes(items.map(source => source.online
    ? `[${source.id}] 网络背景：${source.title}\n${source.url}\n检索于 ${source.searchedAt}\n${source.snippet}`
    : `[${source.number}] ${source.title || source.name}\n${source.doi || '无 DOI'}\n${source.id}`).join('\n\n'))
  const middle = Math.ceil(items.length / 2)
  for (const [index, item] of items.entries()) {
    const column = index >= middle ? 1 : 0
    const row = column ? index - middle : index
    const fullTitle = (item.title || item.name).replace(/\s+/g, ' ')
    const title = fullTitle.length > 52 ? `${fullTitle.slice(0, 51).trimEnd()}…` : fullTitle
    addText(slide, item.online ? `[${item.id}] 网络 · ${title}` : `[${item.number}] ${title}`,
      { x: 0.72 + column * 6.27, y: 1.47 + row * 0.29, w: 5.91, h: 0.26 },
      { fontSize: 8.8, valign: 'top' })
  }
  addText(slide, 'PDF 与网络来源分开标注；完整 URL、题名与 DOI 见备注和来源清单',
    { x: 0.72, y: 6.86, w: 8, h: 0.22 }, { fontSize: 8.7, color: C.muted })
  return slide
}

export async function writeDeck(store, outlineRecord, generated, options = {}) {
  const outline = validateOutline(store, outlineRecord.data)
  const figures = new Map(store.figures().filter(figure => outline.sourceIds.includes(figure.source_id))
    .map(figure => [figure.id, figure]))
  const sources = new Map(selectedSources(store, outline.sourceIds)
    .map((source, index) => [source.id, { ...source, number: index + 1 }]))
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'dsh Notebook Studio'
  pptx.subject = '有页码出处的文献综述'
  pptx.title = outline.title
  pptx.lang = 'zh-CN'
  pptx.theme = { headFontFace: 'PingFang SC', bodyFontFace: 'PingFang SC', lang: 'zh-CN' }
  const manifest = { version: 3, content: outline, sessionId: store.sessionId, outlineRevision: outlineRecord.revision,
    prompt: outline.prompt, sourceIds: outline.sourceIds, webSources: outline.webSources,
    sources: [...sources.values()].map(({ id, name, title, doi, page_count, number }) =>
      ({ id, name, title, doi, pageCount: page_count, number })), slides: [] }

  for (const [index, item] of outline.slides.entries()) {
    const slide = pptx.addSlide()
    addBase(pptx, slide, item.title, index + 1)
    const { rows, online, short } = citations(store, [item.takeaway, ...item.points].filter(Boolean),
      sources, outline.webSources)
    let visual
    if (item.visualKind === 'paper') {
      const figure = figures.get(item.figureId)
      if (!figure) throw new Error(`第 ${index + 1} 页引用的文献原图不存在；请重新生成大纲`)
      const original = sources.get(figure.source_id)
      if (!original) throw new Error('文献原图的来源已失效')
      const caption = `[${original.number}] PDF p.${figure.page} · ${figure.caption}`
      putContainedImage(slide, join(store.directory, figure.path), figure,
        { x: 7.59, y: 1.68, w: 4.97, h: 4.43 }, caption)
      addText(slide, captionPreview(`[${original.number}] PDF p.${figure.page} · ${item.visualCaption || figure.caption}`),
        { x: 7.58, y: 6.23, w: 4.96, h: 0.4 },
        { fontSize: 10.3, color: C.muted })
      visual = { type: 'paper', figureId: figure.id, sourceId: figure.source_id,
        page: figure.page, bbox: figure.bbox, caption: figure.caption }
    } else if (item.visualKind === 'flow') {
      renderFlow(pptx, slide, item.flowNodes, item.visualCaption)
      visual = { type: 'flow', editable: true, nodes: item.flowNodes }
    } else if (item.visualKind === 'table') {
      const rows = renderEvidenceTable(slide, store, item, sources)
      visual = { type: 'table', editable: true, rows }
    } else {
      const asset = generated.get(index)
      if (!asset) throw new Error(`第 ${index + 1} 页尚未生成本地 AI 示意图`)
      const bytes = await stat(asset.path)
      if (!bytes.size) throw new Error(`第 ${index + 1} 页的 AI 图片已丢失`)
      const size = asset.size || { width: 1024, height: 1024 }
      putContainedImage(slide, asset.path, size,
        index === 0 ? { x: 7.22, y: 1.68, w: 5.24, h: 4.43 }
          : { x: 7.59, y: 1.68, w: 4.97, h: 4.43 }, 'AI 概念示意图，非文献证据')
      addText(slide, captionPreview(`AI 示意图 · 非实验结果 · ${item.visualCaption || item.title}`),
        { x: 7.59, y: 6.28, w: 4.9, h: 0.3 },
        { fontSize: 10.3, color: C.muted })
      visual = { type: 'generated', model: asset.model, prompt: item.visualPrompt,
        assetKey: asset.key, evidence: false }
    }
    if (index === 0 && !item.points.length) {
      addText(slide, outline.title, { x: 0.75, y: 2.15, w: 6.1, h: 2.7 },
        { fontSize: 31, bold: true, valign: 'mid' })
      addText(slide, `汇总 ${sources.size} 篇文献 · 溯源至 PDF 页码`,
        { x: 0.78, y: 5.29, w: 6.2, h: 0.45 }, { fontSize: 17, color: C.accent })
    } else {
      renderPoints(pptx, slide, item.points, short, item.takeaway)
    }
    // 正文关联说明与原始图注分开保留，不覆盖论文原图的出处说明。
    visual.purpose = item.visualCaption || item.title
    addNotes(slide, rows, online, visual, item)
    manifest.slides.push({ number: index + 1, title: item.title,
      takeaway: item.takeaway || null, points: item.points, speakerNotes: item.speakerNotes || '',
      citations: rows.map(row => ({ evidenceId: row.evidenceId,
        sourceId: row.sourceId, page: row.page })),
      webCitations: online.map(source => ({ id: source.id, url: source.url,
        searchedAt: source.searchedAt })), visual })
  }
  renderReferences(pptx, sources, outline.webSources)
  if (pptx._slides.length !== 15) throw new Error('幻灯片数量不是预期的 15 页')
  const id = randomUUID()
  const root = join(store.directory, 'decks')
  const path = join(root, `${id}.pptx`)
  const manifestPath = join(root, `${id}.sources.json`)
  const staging = join(root, `.deck-${id}.pptx`)
  try {
    await pptx.writeFile({ fileName: staging, compression: true })
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
    await rename(staging, path)
    store.saveDeck(id, outlineRecord.revision, path, manifestPath, options.promptHash)
  } finally {
    await rm(staging, { force: true })
  }
  return store.deck(id)
}
