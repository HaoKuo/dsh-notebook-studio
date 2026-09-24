import { createHash, randomUUID } from 'node:crypto'
import { searchReferences, selectedSources, validateWebSources, webIds } from './context.js'
import { generateConceptImage } from './image.js'
import { modelJson, prepareEvidence, resolveRefs, shortText } from './model.js'
import { writeReportFiles } from './report-files.js'
import { textFingerprint } from './settings.js'
import { conceptPrompt, figureCatalog, resolveVisuals } from './visuals.js'

export function reportFingerprint(store, settings, prompt, options = {}) {
  const sourceIds = selectedSources(store, options.sourceIds).map(source => source.id)
  return createHash('sha256').update(JSON.stringify(['content-visuals-v2', prompt, textFingerprint(settings),
    settings.image, sourceIds, !!options.includeWeb, options.webSources || []])).digest('hex')
}

function claim(store, item, refs, webSources) {
  const text = shortText(item?.text, 900)
  const evidenceIds = resolveRefs(item?.refs, refs).slice(0, 4)
  if (!text || !evidenceIds.length || evidenceIds.some(id => !store.evidence(id))) {
    throw new Error('报告存在没有有效文献页码的结论')
  }
  return { text, evidenceIds, webIds: webIds({ webIds: item.webRefs || [] }, webSources) }
}

export function validateReport(store, data, options = {}) {
  if (!data || typeof data !== 'object' || !shortText(data.title, 140)
      || !Array.isArray(data.overview) || !data.overview.length
      || !Array.isArray(data.sections) || data.sections.length < 3 || data.sections.length > 9) {
    throw new Error('报告缺少标题、摘要或有效章节')
  }
  const sourceIds = selectedSources(store, data.sourceIds).map(source => source.id)
  const selected = new Set(sourceIds)
  const webSources = validateWebSources(data.webSources || [])
  const valid = item => {
    const text = shortText(item?.text, 900)
    const ids = [...new Set(item?.evidenceIds || [])]
    if (!text || !ids.length || ids.some(id => typeof id !== 'string'
        || !selected.has(store.evidence(id)?.sourceId))) {
      throw new Error('报告存在无页码依据的段落')
    }
    return { text, evidenceIds: ids, webIds: webIds(item, webSources) }
  }
  const used = new Set()
  const sections = data.sections.map(section => {
    if (!shortText(section.title, 100) || !Array.isArray(section.paragraphs)
        || !section.paragraphs.length || section.paragraphs.length > 5) {
      throw new Error('报告章节结构无效')
    }
    const content = { title: shortText(section.title, 100), paragraphs: section.paragraphs.map(valid) }
    return { ...content, visuals: resolveVisuals(store, content, sourceIds, section.visuals,
      { ...options, used }) }
  })
  const tableRows = data.tableRows || []
  if (!Array.isArray(tableRows) || tableRows.length > 30) throw new Error('证据表格无效')
  if (data.figureId && !store.figures().some(figure => figure.id === data.figureId
      && selected.has(figure.source_id))) throw new Error('报告插图不属于所选 PDF')
  return { title: shortText(data.title, 140), prompt: shortText(data.prompt, 1200),
    sourceIds, webSources, overview: data.overview.map(valid), sections,
    tableRows: tableRows.map(row => {
      if (!selected.has(row.sourceId)) throw new Error('证据表格包含未选择的 PDF')
      return { sourceId: row.sourceId, finding: shortText(row.finding, 250),
        evidenceIds: valid({ text: row.finding, evidenceIds: row.evidenceIds }).evidenceIds }
    }),
    figureId: data.figureId || null, flowNodes: (data.flowNodes || [])
      .map(node => shortText(node, 60)).filter(Boolean).slice(0, 5),
    generatedPrompt: shortText(data.generatedPrompt, 360) }
}

export async function buildReport(ctx, store, settings, prompt, signal, progress = () => {}, options = {}) {
  const sourceIds = selectedSources(store, options.sourceIds).map(source => source.id)
  const webSources = options.includeWeb ? await searchReferences(ctx, prompt, signal) : []
  const { papers, themes } = await prepareEvidence(ctx, store, settings.text, signal, progress, sourceIds)
  const refs = new Map(themes.map((theme, index) => [`R${index + 1}`, theme.evidenceIds]))
  const material = themes.map((theme, index) => `[R${index + 1}] ${theme.text}`).join('\n')
  // 让报告撰写直接看到每篇被选论文的原文页段，而不只看到二级主题摘要。
  const excerpts = papers.map(({ source, summary }, index) => {
    const evidence = store.evidence(summary.claims[0].evidenceIds[0])
    if (!evidence) throw new Error(`文献 ${source.name} 的逐页证据已失效`)
    refs.set(`P${index + 1}`, [evidence.evidenceId])
    return `[P${index + 1} | ${source.title || source.name} | PDF p.${evidence.page}] ${evidence.excerpt.slice(0, 650)}`
  }).join('\n\n')
  const web = webSources.map(source => `[${source.id}] ${source.title}：${source.snippet}\n${source.url}`).join('\n')
  const tableRows = papers.map(({ source, summary }) => ({ sourceId: source.id,
    finding: summary.claims[0].text, evidenceIds: summary.claims[0].evidenceIds.slice(0, 4) }))
  const figures = sourceIds.flatMap(id => store.figures().filter(figure => figure.source_id === id)
    .sort((left, right) => right.score - left.score).slice(0, 3))
  progress('生成有引用的报告章节')
  const raw = await modelJson(ctx, store.sessionId,
    '你是严谨的学术综述编辑。PDF 逐页证据是事实依据，网络摘录只作辅助背景。不得编造数据、来源和引用。只输出 JSON。',
    `写作目标：${prompt}。生成中文学术报告。JSON 模式：` +
    '{"title":"标题","overview":[{"text":"执行摘要段落","refs":["R1"],"webRefs":[]}],' +
    '"sections":[{"title":"分节标题","paragraphs":[{"text":"论述段落","refs":["R1","R2"],"webRefs":[]}]}]}。' +
    '共 4–7 节，每节 2–4 段，每段约 90–180 个汉字；摘要 1–2 段。' +
    '围绕问题、方法、跨文献比较、局限和结论建立论证；引用实际存在的 R 主题或 P 原文页段，' +
    '不能用网络摘录替代文献事实，不要写不在材料里的实验数据；' +
    '材料不足之处明确说证据不足。每段必须有 PDF refs；可选 webRefs 只能用于确有相应摘录的辅助背景。\n\nPDF 主题：\n' + material +
    '\n\n所选论文原文页段（PDF）：\n' + excerpts +
    '\n\n每节另有 visuals 数组，按该节内容选择 0–2 个有解释价值的插图，不设全篇固定数量。' +
    '元素模式：{"type":"paper/flow/generated/table","figureId":"paper 使用候选 ID","caption":"这张图解释本节什么内容","nodes":["机制或流程步骤"],"prompt":"generated 的具体构图要求"}。' +
    '研究结果优先相关原图，机制步骤用流程图，研究对照用表格，抽象概念可生图；文字足以说明的小节可不插图，核心分析节应有合适的图表。原图须来自该节引用的 PDF，避免重复同一张图。' +
    `生图${settings.image.enabled ? '可用' : '不可用'}；候选原图：${figureCatalog(figures)}` +
    (web ? `\n\n联网参考（不能冒充 PDF）：\n${web}` : ''),
    settings.text, 12_000, signal, value => {
      if (!Array.isArray(value.overview) || !Array.isArray(value.sections)
          || value.sections.length < 3 || value.sections.length > 9) {
        throw new Error('报告模型返回的章节无效')
      }
      const content = { title: value.title,
        overview: value.overview.map(item => claim(store, item, refs, webSources)),
        sections: value.sections.map(section => ({ title: section.title,
          paragraphs: (section.paragraphs || []).map(item => claim(store, item, refs, webSources)),
          visuals: section.visuals })) }
      return validateReport(store, { ...content, prompt, sourceIds, webSources, tableRows },
        { imageEnabled: settings.image.enabled, allowedFigureIds: new Set(figures.map(figure => figure.id)) })
    })
  const hash = reportFingerprint(store, settings, prompt,
    { sourceIds, includeWeb: !!options.includeWeb, webSources })
  return store.saveReport(randomUUID(), hash, raw)
}

export async function renderReport(store, report, settings, signal, progress = () => {}) {
  const data = validateReport(store, report.data)
  const generated = new Map()
  let warning = null
  for (const [sectionIndex, section] of data.sections.entries()) {
    for (const [visualIndex, visual] of section.visuals.entries()) {
      if (visual.type !== 'generated') continue
      if (settings.image.enabled && !warning) {
        progress(`生成第 ${sectionIndex + 1} 节插图：${visual.caption}`)
        try {
          const asset = await generateConceptImage(store, conceptPrompt(section, visual.prompt), settings.image, { signal })
          generated.set(`${sectionIndex}:${visualIndex}`, { ...asset, model: settings.image.model })
          continue
        } catch (error) {
          signal?.throwIfAborted()
          warning = `图片模型不可用：${String(error?.message || error)}；已改用章节流程图并继续排版`
        }
      }
      visual.type = 'flow'
    }
  }
  signal?.throwIfAborted()
  progress('排版 DOCX 与 PDF')
  const files = await writeReportFiles(store, report.id, data, generated, signal)
  return warning ? { ...files, warning } : files
}
