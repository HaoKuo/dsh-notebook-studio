export function selectedSources(store, sourceIds) {
  const all = store.listSources()
  const ids = sourceIds === undefined ? all.filter(source => source.status === 'ready')
    .map(source => source.id) : sourceIds
  if (!Array.isArray(ids) || !ids.length || ids.length > 30
      || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('请选择 1–30 篇已索引的 PDF 文献')
  }
  const byId = new Map(all.map(source => [source.id, source]))
  return ids.map(id => {
    const source = byId.get(id)
    if (!source || source.status !== 'ready') throw new Error('所选 PDF 不存在或尚未完成索引')
    return source
  })
}

function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 700) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')
        || url.hostname.endsWith('.local') || /^\d+(?:\.\d+){3}$/.test(url.hostname)) return null
    url.hash = ''
    return url.href
  } catch { return null }
}

export function validateWebSources(value) {
  if (!Array.isArray(value) || value.length > 6) throw new Error('网络参考资料无效')
  const urls = new Set()
  return value.map((item, index) => {
    const url = safeUrl(item?.url)
    if (!url || urls.has(url) || item.id !== `W${index + 1}`
        || typeof item.snippet !== 'string' || !item.snippet.trim()
        || typeof item.searchedAt !== 'string' || Number.isNaN(Date.parse(item.searchedAt))) {
      throw new Error('网络参考资料的 URL、摘录或检索时间无效')
    }
    urls.add(url)
    return { id: item.id, url, title: String(item.title || new URL(url).hostname).slice(0, 160),
      snippet: item.snippet.trim().slice(0, 450), searchedAt: item.searchedAt,
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt.slice(0, 80) : null,
      query: typeof item.query === 'string' ? item.query.slice(0, 160) : '' }
  })
}

export async function searchReferences(ctx, prompt, signal) {
  if (!ctx.web?.search) throw new Error('未加载 dsh 网络搜索服务；请关闭联网参考或配置搜索插件')
  // 仅从用户输入提炼查询，不把 PDF 正文或文献摘要发送给搜索提供方。
  const query = (prompt.match(/[\p{L}\p{N}]+/gu) || []).join(' ').slice(0, 140).trim()
  if (!query) throw new Error('联网检索需要明确的写作提示词')
  const result = await ctx.web.search({ query, maxResults: 6 }, signal)
  const found = []
  const seen = new Set()
  const searchedAt = new Date().toISOString()
  for (const item of result?.sources || []) {
    const url = safeUrl(item.url)
    if (!url || seen.has(url) || typeof item.snippet !== 'string' || !item.snippet.trim()) continue
    seen.add(url)
    found.push({ id: `W${found.length + 1}`, url, title: item.title,
      snippet: item.snippet, publishedAt: item.publishedAt, query, searchedAt })
    if (found.length === 6) break
  }
  if (!found.length) throw new Error('联网检索没有带摘录的可信 HTTPS 来源，请更换提示词或关闭联网参考')
  return validateWebSources(found)
}

export function webIds(item, sources) {
  const ids = item?.webIds || []
  const allowed = new Set(sources.map(source => source.id))
  if (!Array.isArray(ids) || ids.length > 4 || ids.some(id => !allowed.has(id))) {
    throw new Error('存在未检索到的网络引用')
  }
  return [...new Set(ids)]
}
