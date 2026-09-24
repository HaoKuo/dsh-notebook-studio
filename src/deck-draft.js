import { createHash } from 'node:crypto'
import { selectedSources, webIds } from './context.js'
import { modelJson, resolveRefs, shortText, validateOutline } from './model.js'
import { textFingerprint } from './settings.js'
import { applySlideVisual, figureCandidates, figureCatalog, resolveVisuals } from './visuals.js'

export function deckFingerprint(record, settings) {
  return createHash('sha256').update(JSON.stringify(['content-visuals-v2', record.revision, record.data,
    textFingerprint(settings), settings.image])).digest('hex')
}

function slideEvidence(store, slide, sourceIds) {
  // 每条大纲论点至少保留一条锚定证据，其余位置再交给相关检索片段。
  const anchors = [...slide.points.map(point => point.evidenceIds[0]),
    ...slide.points.flatMap(point => point.evidenceIds.slice(1))]
  const related = store.search(slide.title, 4, sourceIds).map(row => row.evidenceId)
  const ids = [...new Set([...anchors, ...related])].slice(0, 10)
  return ids.map(id => store.evidence(id)).filter(row => row && sourceIds.includes(row.sourceId))
}

function validateSlide(store, slide, raw, evidence, webSources, number) {
  const allowed = new Set(evidence.map(item => item.evidenceId))
  const check = (item, label, limit) => {
    const text = shortText(item?.text, limit + 1)
    const ids = item?.evidenceIds
    if (!text || text.length > limit) {
      throw new Error(`第 ${number} 页${label}须为 1–${limit} 字，当前 ${text.length} 字；请压缩文字并保留 refs`)
    }
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !allowed.has(id))) {
      throw new Error(`第 ${number} 页${label}未引用当前 PDF 摘录`)
    }
    if (ids.length > 4) throw new Error(`第 ${number} 页${label}引用过多；请保留最相关的 1–4 个 refs`)
    return { text, evidenceIds: [...new Set(ids)], webIds: webIds(item, webSources) }
  }
  if (!Array.isArray(raw?.points) || raw.points.length < 2 || raw.points.length > 4) {
    throw new Error(`第 ${number} 页详细论述须有 2–4 条`)
  }
  const notes = shortText(raw.speakerNotes, 1201)
  if (notes.length < 70 || notes.length > 1200) {
    throw new Error(`第 ${number} 页的讲者备注需要完整的论证与局限说明`)
  }
  return { ...slide, takeaway: check(raw.takeaway, '核心结论', 120),
    points: raw.points.map(point => check(point, '论述', 145)), speakerNotes: notes }
}

export async function buildDeckDraft(ctx, store, record, settings, signal, progress = () => {}) {
  const outline = validateOutline(store, record.data)
  const sources = selectedSources(store, outline.sourceIds)
  const webSources = outline.webSources
  const sourceIds = sources.map(source => source.id)
  const hash = deckFingerprint(record, settings)
  const slides = []
  const usedFigures = new Set()
  for (const [index, slide] of outline.slides.entries()) {
    signal?.throwIfAborted()
    if (index === 0 && !slide.points.length) {
      slides.push({ ...slide, speakerNotes: `写作目标：${outline.prompt || outline.title}。本报告综合 ${sources.length} 篇所选 PDF，所有研究事实以 PDF 原文页码为准。` })
      continue
    }
    progress(`依据 PDF 逐页成稿 ${index + 1}/14`)
    const evidence = slideEvidence(store, slide, sourceIds)
    if (!evidence.length) throw new Error(`第 ${index + 1} 页没有可用的逐页 PDF 证据`)
    const candidates = figureCandidates(store, slide, sourceIds, usedFigures)
    const decorate = (content, visual) => {
      const [planned] = resolveVisuals(store, content, sourceIds, visual ? [visual] : undefined,
        { imageEnabled: settings.image.enabled, used: new Set(usedFigures), limit: 1,
          allowedFigureIds: new Set(candidates.map(figure => figure.id)) })
      return applySlideVisual(content, planned)
    }
    const cached = store.getSlideDraft(hash, index)
    if (cached) {
      try {
        const restored = decorate(validateSlide(store, slide, cached, evidence, webSources, index + 1), cached.visual)
        slides.push(restored)
        if (restored.figureId) usedFigures.add(restored.figureId)
        continue
      } catch { /* 旧缓存不符合当前约束时重新成稿。 */ }
    }
    const refs = new Map(evidence.map((row, position) => [`E${position + 1}`, row.evidenceId]))
    const material = evidence.map((row, position) =>
      `[E${position + 1} | ${row.title || row.name} | PDF p.${row.page}] ${row.excerpt.slice(0, 1150)}`).join('\n\n')
    const web = webSources.map(item => `[${item.id} | 网络背景 | ${item.title}] ${item.snippet}`)
      .join('\n')
    const raw = await modelJson(ctx, store.sessionId,
      '你是严谨的中文学术演示文稿作者。仅从给定 PDF 摘录推导研究事实；网络结果只能补充背景，不得冒充论文数据。分清研究发现与局限。只输出 JSON。',
      `写作目标：${outline.prompt || '如实综述所选文献'}。全稿主题：${outline.title}。` +
      `本页是第 ${index + 1}/14 页：${slide.title}；上一页：${outline.slides[index - 1]?.title || '无'}；下一页：${outline.slides[index + 1]?.title || '参考文献'}。` +
      `大纲要点：${slide.points.map(point => point.text).join('；')}。` +
      '请写一页真正可演讲的成稿，不要复述大纲：明确核心结论、2–4 条有分析的论述（每条 35–110 字），' +
      '以及 120–450 字讲者备注，解释证据、跨文献关系与局限。表格页各论述须是可核实的对照行。' +
      '核心结论为 30–80 字，绝不超过 120 字；每条论述绝不超过 145 字。每个核心结论及每条论述必须有 1–4 个 PDF 摘录 refs；只有确有相关网络摘录时才附 webRefs。' +
      'JSON：{"takeaway":{"text":"本页核心结论","refs":["E1"],"webRefs":[]},' +
      '"points":[{"text":"可核实的分析","refs":["E1"],"webRefs":[]}],' +
      '"speakerNotes":"详细讲述与证据局限"}。禁止虚构数据与不存在的编号。\n\nPDF 摘录：\n' + material +
      '\n\n同时添加 visual 字段：{"type":"paper/flow/table/generated","figureId":"仅 paper 使用候选 ID","caption":"图与本页论述的关系","nodes":["流程步骤"],"prompt":"仅 generated 使用的具体构图要求"}。' +
      '按本页正文选最有解释力的视觉方式：结果优先相关原图，机制与步骤用流程图，多篇对照用表格，抽象概念才用生成图。不要机械重复同一种图。' +
      `生图${settings.image.enabled ? '可用' : '不可用'}；候选原图（须引用图所属 PDF 的摘录）：${figureCatalog(candidates)}` +
      (web ? `\n\n网络背景（非 PDF）：\n${web}` : ''),
      settings.text, 4096, signal, value => {
        const convert = (item, label) => {
          if (!Array.isArray(item?.refs) || !item.refs.length) {
            throw new Error(`第 ${index + 1} 页${label}缺少 refs；请从 ${[...refs.keys()].join('、')} 中选择真正支持该结论的摘录`)
          }
          return { text: item?.text, evidenceIds: resolveRefs(item.refs, refs),
            webIds: item?.webRefs || [] }
        }
        return decorate(validateSlide(store, slide, { takeaway: convert(value.takeaway, '核心结论'),
          points: (value.points || []).map((point, position) => convert(point, `论述 ${position + 1}`)),
          speakerNotes: value.speakerNotes },
        evidence, webSources, index + 1), value.visual)
      })
    store.putSlideDraft(hash, index, {
      takeaway: raw.takeaway, points: raw.points, speakerNotes: raw.speakerNotes,
      visual: { type: raw.visualKind, figureId: raw.figureId, nodes: raw.flowNodes,
        caption: raw.visualCaption, prompt: raw.visualPrompt },
    })
    if (raw.figureId) usedFigures.add(raw.figureId)
    slides.push(raw)
  }
  return { hash, data: validateOutline(store, { ...outline, slides }) }
}
