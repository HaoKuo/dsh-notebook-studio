import { readFile } from 'node:fs/promises'
import { validateOutline } from './model.js'
import { validateReport } from './report.js'

export async function readDocument(store, kind, id) {
  if (!['report', 'deck'].includes(kind)) throw new Error('成稿类型无效')
  const record = kind === 'report' ? store.report(id) : store.deck(id)
  if (!record) throw new Error('当前会话没有这份成稿')
  if (kind === 'report') return { id, kind, data: record.data }
  const manifest = JSON.parse(await readFile(record.manifest_path, 'utf8'))
  // 旧版成稿从来源清单还原正文，不把当前大纲冒充已经导出的内容。
  const data = manifest.content || {
    title: manifest.slides?.[0]?.title,
    prompt: manifest.prompt, sourceIds: manifest.sourceIds, webSources: manifest.webSources,
    slides: manifest.slides?.map(slide => ({
      title: slide.title, takeaway: slide.takeaway, points: slide.points,
      speakerNotes: slide.speakerNotes, visualKind: slide.visual.type,
      figureId: slide.visual.figureId, flowNodes: slide.visual.nodes || [],
      visualPrompt: slide.visual.prompt || '', visualCaption: slide.visual.purpose || '',
    })),
  }
  return { id, kind, data: validateOutline(store, data) }
}

function text(value, limit, label, optional = false) {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > limit) {
    throw new Error(`${label}应为${optional ? '不超过' : '1–'}${limit} 字`)
  }
  return value.trim()
}

function sameLength(original, edited, label) {
  if (!Array.isArray(edited) || edited.length !== original.length) {
    throw new Error(`${label}数量已改变，请重新打开成稿编辑`)
  }
}

function editClaims(original, edited, limit, label) {
  sameLength(original, edited, label)
  return original.map((claim, index) => ({ ...claim,
    text: text(edited[index]?.text, limit, `${label} ${index + 1}`) }))
}

export function editDocument(store, original, edited) {
  const data = structuredClone(original.data)
  data.title = text(edited?.title, 140, '总标题')
  // 只接收可编辑文字；来源、引用、图片和联网出处始终取自原稿。
  if (original.kind === 'report') {
    data.overview = editClaims(data.overview, edited.overview, 900, '摘要')
    sameLength(data.sections, edited.sections, '报告章节')
    data.sections = data.sections.map((section, index) => ({ ...section,
      title: text(edited.sections[index]?.title, 100, '章节标题'),
      paragraphs: editClaims(section.paragraphs, edited.sections[index]?.paragraphs, 900, '正文段落'),
    }))
    data.tableRows = editClaims((data.tableRows || []).map(row => ({ ...row, text: row.finding })),
      (edited.tableRows || []).map(row => ({ text: row.finding })), 250, '证据表格')
      .map(({ text: finding, ...row }) => ({ ...row, finding }))
    return validateReport(store, data)
  }
  sameLength(data.slides, edited.slides, '幻灯片')
  data.slides = data.slides.map((slide, index) => {
    const next = edited.slides[index]
    return { ...slide, title: text(next?.title, 70, '幻灯片标题'),
      points: editClaims(slide.points, next?.points, 145, '幻灯片论述'),
      ...(slide.takeaway ? { takeaway: { ...slide.takeaway,
        text: text(next?.takeaway?.text, 120, '核心结论') } } : {}),
      speakerNotes: text(next?.speakerNotes || '', 1200, '讲者备注', true),
    }
  })
  return validateOutline(store, data)
}
