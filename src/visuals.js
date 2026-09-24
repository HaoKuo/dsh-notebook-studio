function clean(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function claimsFor(unit) {
  return unit.paragraphs || unit.points || []
}

function words(text) {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\p{Script=Han}]{2}/gu) || []))
}

export function figureCandidates(store, unit, sourceIds, used = new Set()) {
  const evidence = claimsFor(unit).flatMap(claim => claim.evidenceIds || [])
    .map(id => store.evidence(id)).filter(Boolean)
  const cited = new Set(evidence.map(row => row.sourceId))
  const query = words(`${unit.title} ${claimsFor(unit).map(claim => claim.text).join(' ')} ${evidence.map(row => row.excerpt?.slice(0, 500)).join(' ')}`)
  return store.figures().filter(figure => sourceIds.includes(figure.source_id)
    && cited.has(figure.source_id) && !used.has(figure.id)).map(figure => {
    const distance = Math.min(...evidence.filter(row => row.sourceId === figure.source_id)
      .map(row => Math.abs(row.page - figure.page)))
    const overlap = [...words(figure.caption)].filter(word => query.has(word)).length
    return { ...figure, relevance: (distance === 0 ? 12 : distance === 1 ? 3 : 0) + overlap,
      relevant: distance === 0 || distance <= 2 && overlap >= 2 }
  }).filter(figure => figure.relevant).sort((left, right) => right.relevance - left.relevance
    || right.score - left.score).slice(0, 8)
}

export function figureCatalog(figures) {
  return JSON.stringify(figures.map(figure => ({ figureId: figure.id,
    sourceId: figure.source_id, document: figure.title || figure.name,
    page: figure.page, caption: clean(figure.caption, 280) })))
}

export function resolveVisuals(store, unit, sourceIds, requested, options = {}) {
  const { imageEnabled = true, used = new Set(), limit = 2, allowedFigureIds } = options
  const claims = claimsFor(unit)
  const evidenceIds = [...new Set(claims.flatMap(claim => claim.evidenceIds || []))]
  const cited = new Set(evidenceIds.map(id => store.evidence(id)?.sourceId).filter(Boolean))
  const candidates = figureCandidates(store, unit, sourceIds, used)
    .filter(figure => !allowedFigureIds || allowedFigureIds.has(figure.id))
  const fallbackNodes = [unit.title, ...claims.slice(0, 3).map(claim => clean(claim.text, 48))]
    .map(node => clean(node, 60)).filter(Boolean)
  if (fallbackNodes.length < 2) fallbackNodes.push('文献证据与局限')
  if (requested === undefined) {
    requested = candidates.length ? [{ type: 'paper', figureId: candidates[0].id }]
      : [{ type: 'flow', nodes: fallbackNodes }]
  }
  if (!Array.isArray(requested) || requested.length > limit) {
    throw new Error(`章节插图须为 0–${limit} 项`)
  }
  return requested.map(request => {
    let type = request?.type
    if (!['paper', 'flow', 'generated', 'table'].includes(type)) throw new Error('插图类型无效')
    const caption = clean(request.caption, 260) || clean(unit.title, 140)
    let figureId = null
    if (type === 'paper') {
      const figure = store.figures().find(item => item.id === request.figureId)
      if (!figure || !sourceIds.includes(figure.source_id) || !cited.has(figure.source_id)
          || allowedFigureIds && !allowedFigureIds.has(figure.id)) {
        throw new Error('插图必须选择候选图，并引用该图所属 PDF 的证据')
      }
      if (used.has(figure.id)) type = 'flow'
      else { figureId = figure.id; used.add(figure.id) }
    }
    if (type === 'generated' && !imageEnabled) type = 'flow'
    const requestedNodes = Array.isArray(request.nodes)
      ? request.nodes.map(node => clean(node, 60)).filter(Boolean).slice(0, 5) : []
    const nodes = requestedNodes.length >= 2 ? requestedNodes : fallbackNodes
    const prompt = type === 'generated' ? clean(request.prompt, 480) || caption : ''
    return { type, caption, figureId, nodes, prompt, evidenceIds }
  })
}

export function conceptPrompt(unit, prompt) {
  // 生图只解释当前正文中的概念，禁止把生成图当作实验数据。
  return `Scientific concept illustration. ${clean(prompt, 320) || clean(unit.title, 140)}. Context: ${claimsFor(unit).map(claim => claim.text).join('; ').slice(0, 430)}. No text, no numbers, no data charts, no fabricated experimental images.`.slice(0, 1000)
}

export function applySlideVisual(slide, visual) {
  return { ...slide, visualKind: visual.type, figureId: visual.figureId,
    flowNodes: visual.nodes, visualPrompt: visual.prompt,
    visualCaption: visual.caption }
}
