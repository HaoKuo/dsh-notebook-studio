window.__ModuleLoader__.load({
  id: 'dsh-notebook-studio',
  factory: require => {
    const React = require('react')
    const h = React.createElement
    const inject = ['slots', 'connection', 'layout', 'uiSession']
    const css = `
      .dls,.dls-dialog{--studio-bg:var(--dsw-alias-bg-base);--studio-ink:var(--dsw-alias-label-primary);--studio-muted:var(--dsw-alias-label-secondary);--studio-line:var(--dsw-alias-border-l3);--studio-accent:var(--dsw-alias-brand-primary);--studio-selected:var(--dsw-alias-interactive-bg-active);--studio-error:var(--dsw-alias-state-error-primary);--studio-success:var(--dsw-alias-state-success-primary);color:var(--studio-ink);background:var(--studio-bg);font:14px/1.6 var(--dsw-font-family,system-ui,sans-serif);accent-color:var(--studio-accent)}
      .dls{height:100%;min-height:0;display:flex;flex-direction:column;container-type:inline-size;overflow:hidden}
      .dls *,.dls-dialog *{box-sizing:border-box}.dls h1,.dls h2,.dls h3,.dls p{margin:0}
      .dls h1{font-size:18px;line-height:1.4}.dls h2{font-size:16px}.dls h3{font-size:15px}
      .dls button,.dls input,.dls textarea,.dls select{font:inherit}
      .dls-btn{border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);padding:7px 12px;cursor:pointer;white-space:nowrap;font:inherit}
      .dls-btn.secondary{border-color:var(--studio-line);background:transparent;color:inherit}
      .dls-btn:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.dls-btn.secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dls-btn:disabled{opacity:.45;cursor:not-allowed}
      .dls :focus-visible,.dls-dialog:focus-visible{outline:2px solid var(--studio-accent);outline-offset:3px}
      .dls a{color:var(--dsw-alias-state-business-primary)}
      .dls-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.dls-muted{color:var(--studio-muted);font-size:12px}
      .dls-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 22px;border-bottom:1px solid var(--studio-line);flex:none}
      .dls-brand{display:flex;gap:16px;align-items:center;min-width:0}.dls-project{min-width:0}.dls-project p{max-width:36ch;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .dls-strip{padding:8px 22px;border-bottom:1px solid var(--studio-line);display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .dls-notices:empty{display:none}.dls-errorbox,.dls-okbox{padding:9px 22px;font-size:13px;overflow-wrap:anywhere}
      .dls-errorbox{color:var(--studio-error);background:color-mix(in srgb,var(--studio-error) 10%,transparent)}.dls-okbox{color:var(--studio-ink);background:color-mix(in srgb,var(--studio-success) 10%,transparent)}
      .dls-status{min-width:0;max-width:65ch;font-size:12px;color:var(--studio-muted);overflow-wrap:anywhere}
      .dls-status.warning{color:var(--dsw-alias-state-warn-primary)}.dls-status.failed{color:var(--studio-error)}
      .dls-grid{display:grid;grid-template-columns:270px minmax(0,1fr) 286px;flex:1;min-height:0;overflow:hidden}
      .dls-grid.no-left{grid-template-columns:minmax(0,1fr) 286px}.dls-grid.no-right{grid-template-columns:270px minmax(0,1fr)}.dls-grid.no-left.no-right{grid-template-columns:minmax(0,1fr)}
      .dls-side{padding:20px 18px;overflow:auto;min-width:0}.dls-library{border-right:1px solid var(--studio-line)}.dls-controls{border-left:1px solid var(--studio-line)}
      .dls-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
      .dls-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:14px 0}
      .dls-field{display:block;width:100%;min-width:0;padding:8px 10px;border:1px solid var(--studio-line);border-radius:6px;background:var(--studio-bg);color:inherit}
      .dls-field:focus{border-color:var(--studio-accent);outline:2px solid var(--studio-selected)}.dls-textarea{resize:vertical;min-height:76px;line-height:1.7}
      .dls-field-label{display:block;margin:18px 0 7px;font-size:13px;font-weight:600}
      .dls-upload{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}.dls-upload label{position:relative;overflow:hidden;cursor:pointer}
      .dls-upload label:focus-within{outline:2px solid var(--studio-accent);outline-offset:2px}.dls-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
      .dls-source{padding:13px 0;border-top:1px solid var(--studio-line)}.dls-pick{display:flex;gap:9px;align-items:flex-start}
      .dls-pick input{margin-top:5px;flex:none}.dls-source-name{min-width:0;overflow-wrap:anywhere;font-size:13px}.dls-source-name strong{font-weight:550}
      .dls-badge{font-size:11px;padding:2px 6px;background:var(--studio-selected);color:var(--studio-ink);border-radius:4px;white-space:nowrap}
      .dls-badge.error{background:color-mix(in srgb,var(--studio-error) 10%,transparent);color:var(--studio-error)}.dls-error{color:var(--studio-error);overflow-wrap:anywhere}
      .dls-source-meta{margin-top:6px;display:flex;gap:8px;align-items:center}.dls-source-file{font-size:11px;color:var(--studio-muted)}
      .dls details{margin:14px 0}.dls summary{cursor:pointer;font-weight:550;padding:6px 0;list-style-position:inside}
      .dls-history{max-height:260px;overflow:auto}.dls-search{display:flex;gap:6px;margin:10px 0}.dls-search input{flex:1}
      .dls-result{font-size:12px;border-top:1px solid var(--studio-line);padding:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}
      .dls-center{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-specific-sidebar-fill)}
      .dls-center-head{padding:14px 24px;border-bottom:1px solid var(--studio-line);background:var(--studio-bg);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .dls-tabs{display:flex;gap:4px}.dls-tabs button{background:none;color:var(--studio-muted);border:0;border-radius:5px;padding:6px 12px;cursor:pointer;white-space:nowrap}
      .dls-tabs button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dls-tabs button[aria-current=page]{color:var(--studio-ink);background:var(--studio-selected);font-weight:600}
      .dls-canvas{flex:1;min-height:0;overflow:auto;padding:28px}
      .dls-paper{max-width:860px;margin:0 auto 24px;background:var(--studio-bg);padding:30px 34px;border:1px solid var(--studio-line)}
      .dls-paper h2{margin-bottom:14px;font-size:20px}.dls-paper h3{margin:24px 0 12px}.dls-paper p{margin-bottom:12px;line-height:1.9}
      .dls-paper .dls-field{margin-bottom:12px}.dls-paper-title{font-weight:650;font-size:20px!important}
      .dls-claim{margin:14px 0}.dls-ref{font-size:11px;color:var(--studio-muted);overflow-wrap:anywhere}
      .dls-empty{max-width:520px;margin:9vh auto;text-align:left}.dls-empty h2{font-size:26px;line-height:1.5;margin:18px 0}.dls-empty p{color:var(--studio-muted);margin:16px 0;line-height:1.9}
      .dls-empty-mark{width:54px;height:65px;border:2px solid var(--studio-line);border-radius:8px;display:grid;place-items:center;color:var(--studio-muted);font-size:25px}
      .dls-mode{display:flex;gap:8px}.dls-mode button{flex:1;padding:10px 5px;border:1px solid var(--studio-line);background:transparent;color:inherit;border-radius:7px;cursor:pointer}
      .dls-mode button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dls-mode button[aria-pressed=true]{border-color:var(--studio-accent);box-shadow:inset 0 0 0 1px var(--studio-accent);background:var(--studio-selected);color:var(--studio-ink)}
      .dls-guidance{border-top:1px solid var(--studio-line);margin-top:24px;padding-top:18px}.dls-guidance p{margin:8px 0}
      .dls-preview{display:block;width:100%;height:calc(100dvh - 270px);min-height:450px;border:1px solid var(--studio-line);background:#fff}
      .dls-path{font-size:12px;overflow-wrap:anywhere;margin:12px 0!important}
      .dls-dialog{padding:0;border:1px solid var(--studio-line);border-radius:12px;width:min(900px,94vw);max-height:90dvh}
      .dls-dialog::backdrop{background:var(--dsw-alias-bg-mask-1)}
      .dls-settings-shell{height:auto;max-height:88dvh;overflow:auto;display:block;container-type:normal}
      .dls-settings-body{padding:24px}.dls-settings{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:20px 0}.dls-settings label{display:block;margin:12px 0 5px}
      .dls-welcome{padding:24px;overflow:auto}.dls-welcome .dls-empty{width:100%}
      @container(max-width:1100px){.dls-grid{grid-template-columns:220px minmax(0,1fr) 245px}.dls-grid.no-left{grid-template-columns:minmax(0,1fr) 245px}.dls-grid.no-right{grid-template-columns:220px minmax(0,1fr)}.dls-canvas{padding:18px}.dls-paper{padding:22px}.dls-side{padding:16px 13px}.dls-head{padding:12px 16px}}
      @container(max-width:850px){.dls-grid,.dls-grid.no-left,.dls-grid.no-right,.dls-grid.no-left.no-right{display:flex;flex-direction:column;overflow:auto}.dls-center{order:0;min-height:480px;flex:none;overflow:visible}.dls-canvas{overflow:visible}.dls-side{flex:none;overflow:visible}.dls-library{order:1;border:0;border-top:1px solid var(--studio-line)}.dls-sources{max-height:350px;overflow:auto}.dls-controls{order:2;border:0;border-top:1px solid var(--studio-line)}.dls-head{flex-wrap:wrap;gap:10px}.dls-strip{padding:8px 14px}.dls-head>.dls-actions{width:100%}.dls-project p{max-width:22ch}.dls-center-head{padding:12px}.dls-empty{margin:30px 0}.dls-empty h2{font-size:22px}.dls-paper{padding:18px}.dls-preview{min-height:400px;height:60dvh}}
      @media(max-width:650px){.dls-settings{display:block}.dls-settings>div+div{margin-top:25px}}

    `

    function button(text, onClick, disabled = false, secondary = false) {
      return h('button', { type: 'button', className: `dls-btn${secondary ? ' secondary' : ''}`,
        onClick, disabled }, text)
    }


    // 离开工作台后保留会话草稿；仅驻留浏览器内存，不保存 API 密钥。
    const workspaces = new Map()
    function workspace(sessionId) {
      if (!workspaces.has(sessionId)) workspaces.set(sessionId, { listeners: new Set(), value: {
        prompt: '围绕这些文献的研究问题、方法、主要结论与局限，形成有证据的学术综述。',
        excludedIds: [], includeWeb: false, reportFormat: 'docx', deckFormat: 'pptx',
        outputKind: 'deck', draft: null, editRevision: null, documentDraft: null,
        dirty: false, saveJob: null, panel: 'content', showLibrary: true, showControls: true,
      } })
      return workspaces.get(sessionId)
    }
    function useSessionState(sessionId, key) {
      const cache = workspace(sessionId)
      const subscribe = React.useCallback(listener => {
        cache.listeners.add(listener)
        return () => cache.listeners.delete(listener)
      }, [cache])
      const state = React.useSyncExternalStore(subscribe, () => cache.value)
      return [state[key], value => {
        cache.value = { ...cache.value,
          [key]: typeof value === 'function' ? value(cache.value[key]) : value }
        cache.listeners.forEach(listener => listener())
      }]
    }
    function Modal({ children, onClose, title }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const dialog = ref.current
        const opener = document.activeElement
        dialog.showModal()
        // React 卸载对话框后浏览器不一定自动归还焦点，显式回到原入口。
        return () => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
      }, [])
      return h('dialog', { ref, className: 'dls-dialog',
        'aria-label': title, onCancel: event => { event.preventDefault(); onClose() } }, children)
    }

    function StudioView({ sessionId, onExit }) {
      const [snapshot, setSnapshot] = React.useState(null)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [results, setResults] = React.useState(null)
      const [settingsDraft, setSettingsDraft] = React.useState(null)
      const [providers, setProviders] = React.useState([])
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [uploadProgress, setUploadProgress] = React.useState('')
      const [uploadBusy, setUploadBusy] = React.useState(false)
      const [preview, setPreview] = React.useState(null)
      const [prompt, setPrompt] = useSessionState(sessionId, 'prompt')
      const [excludedIds, setExcludedIds] = useSessionState(sessionId, 'excludedIds')
      const [includeWeb, setIncludeWeb] = useSessionState(sessionId, 'includeWeb')
      const [reportFormat, setReportFormat] = useSessionState(sessionId, 'reportFormat')
      const [deckFormat, setDeckFormat] = useSessionState(sessionId, 'deckFormat')
      const [outputKind, setOutputKind] = useSessionState(sessionId, 'outputKind')
      const [panel, setPanel] = useSessionState(sessionId, 'panel')
      const [draft, setDraft] = useSessionState(sessionId, 'draft')
      const [editRevision, setEditRevision] = useSessionState(sessionId, 'editRevision')
      const [documentDraft, setDocumentDraft] = useSessionState(sessionId, 'documentDraft')
      const [dirty, setDirty] = useSessionState(sessionId, 'dirty')
      const [saveJob, setSaveJob] = useSessionState(sessionId, 'saveJob')
      const [showLibrary, setShowLibrary] = useSessionState(sessionId, 'showLibrary')
      const [showControls, setShowControls] = useSessionState(sessionId, 'showControls')
      const cancelUpload = React.useRef(false)
      const mounted = React.useRef(true)
      const uniqueId = React.useId()
      const rpc = React.useCallback(async (method, data = {}) => {
        const result = await thisConnection.rpc.call('/studio', method, { sessionId, ...data })
        if (!result.ok) throw new Error(result.error?.message || 'Studio 连接失败')
        return result.value
      }, [sessionId])
      const refresh = React.useCallback(async () => {
        try {
          const value = await rpc('listSources')
          if (mounted.current) setSnapshot(value)
        } catch (cause) {
          if (mounted.current) setError(cause.message)
        }
      }, [rpc])
      React.useEffect(() => {
        mounted.current = true
        void refresh()
        const timer = setInterval(() => { void refresh() }, 2500)
        void rpc('getSettings').then(value => { if (mounted.current) setSettingsDraft(value) })
          .catch(cause => { if (mounted.current) setError(cause.message) })
        void rpc('listModels').then(value => { if (mounted.current) setProviders(value) }).catch(() => {})
        return () => { mounted.current = false; cancelUpload.current = true; clearInterval(timer) }
      }, [rpc, refresh])
      React.useEffect(() => {
        if (!dirty && !draft) return
        const warn = event => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
      }, [dirty, draft])
      React.useEffect(() => {
        if (!saveJob) return
        const job = snapshot?.jobs.find(item => item.id === saveJob.id)
        if (!job || job.state === 'running') return
        setSaveJob(null)
        if (job.state === 'succeeded') {
          setDocumentDraft(null)
          setDirty(false)
          setPreview(null)
          setNotice('修改已保存为新版本。可重新打开正文或预览导出文件。')
        } else {
          // 排版失败仍保留本地草稿；报告草稿已写入数据库，可从新记录继续重试。
          if (saveJob.kind === 'report' && snapshot.report) {
            setDocumentDraft(previous => previous ? { ...previous, id: snapshot.report.id } : previous)
          }
          setError(job.error || '排版中断，编辑内容仍保留，请重试保存。')
        }
      }, [snapshot, saveJob])

      async function action(work) {
        setBusy(true)
        setError('')
        setNotice('')
        try { await work(); await refresh() }
        catch (cause) { if (mounted.current) setError(cause.message) }
        finally { if (mounted.current) setBusy(false) }
      }
      function changeSlide(index, update) {
        setDraft(previous => {
          const copy = structuredClone(previous)
          update(copy.slides[index])
          return copy
        })
      }
      function moveSlide(index, direction) {
        setDraft(previous => {
          const copy = structuredClone(previous)
          const other = index + direction
          if (index === 0 || other < 1 || other >= copy.slides.length) return previous
          ;[copy.slides[index], copy.slides[other]] = [copy.slides[other], copy.slides[index]]
          return copy
        })
      }
      function download(kind) {
        return action(async () => {
          const report = kind.startsWith('report')
          const item = report ? snapshot.report : snapshot.deck
          const info = await rpc(report ? 'downloadReport' : 'downloadDeck',
            report ? { reportId: item.id } : { deckId: item.id })
          const url = { pptx: info.pptxUrl, 'deck-pdf': info.pdfUrl,
            'deck-manifest': info.manifestUrl, 'report-docx': info.docxUrl,
            'report-pdf': info.pdfUrl, 'report-manifest': info.manifestUrl }[kind]
          if (!url) throw new Error('这个格式尚未完成导出，请检查任务状态')
          // 先确认响应完整，再创建下载；服务端错误不能被保存为 0 字节成稿。
          const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
          if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}），请刷新后重试；成稿仍保存在工作区`)
          const blob = await response.blob()
          const expected = Number(response.headers.get('content-length'))
          if (!blob.size || expected > 0 && blob.size !== expected) {
            throw new Error('下载内容为空或不完整，未保存空文件；请重试或打开工作区成稿')
          }
          const localUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = localUrl
          link.download = `studio-${item.id}.${kind.includes('manifest') ? 'sources.json'
            : kind === 'pptx' ? 'pptx' : kind === 'report-docx' ? 'docx' : 'pdf'}`
          document.body.append(link)
          link.click()
          setTimeout(() => { link.remove(); URL.revokeObjectURL(localUrl) }, 60_000)
          setNotice(`完整文件已准备，下载已开始（${(blob.size / 1024).toFixed(0)} KB）`)
        })
      }

      function previewDocument(kind) {
        return action(async () => {
          const report = kind === 'report'
          const item = report ? snapshot.report : snapshot.deck
          const info = await rpc(report ? 'downloadReport' : 'downloadDeck',
            report ? { reportId: item.id } : { deckId: item.id })
          if (!info.previewUrl) throw new Error('PDF 尚未生成，暂时无法预览')
          const response = await fetch(info.previewUrl, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' })
          if (!response.ok || Number(response.headers.get('content-length')) <= 0) {
            throw new Error('PDF 预览暂不可用，请重试；也可直接打开工作区 PDF')
          }
          setPanel('preview')
          setPreview({ kind, id: item.id, title: report ? item.title : '演示文稿', url: info.previewUrl,
            directory: item.outputDirectory })
        })
      }

      function updateSettings(section, key, value) {
        setSettingsDraft(previous => ({ ...previous,
          [section]: { ...previous[section], [key]: value } }))
      }

      async function uploadFiles(selection) {
        const files = Array.from(selection || []).filter(file => file.name.toLowerCase().endsWith('.pdf'))
        if (!files.length) { setError('所选内容中没有 PDF 文件'); return }
        if (files.length > 30 || files.some(file => file.size <= 0 || file.size >= 30_000_000)) {
          setError('一次最多选择 30 篇 PDF；单篇必须非空且严格小于 30 MB')
          return
        }
        setUploadBusy(true)
        cancelUpload.current = false
        setError('')
        let completed = 0
        try {
          for (const file of files) {
            if (cancelUpload.current) break
            let uploadId
            try {
              const started = await rpc('uploadStart', { name: file.name, bytes: file.size })
              uploadId = started.uploadId
              for (let offset = 0; offset < file.size; offset += started.chunkBytes) {
                if (cancelUpload.current) throw new Error('用户取消了上传')
                const bytes = new Uint8Array(await file.slice(offset, offset + started.chunkBytes).arrayBuffer())
                let binary = ''
                for (let index = 0; index < bytes.length; index += 8192) {
                  binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
                }
                await rpc('uploadChunk', { uploadId, offset, data: btoa(binary) })
                setUploadProgress(`${file.name} · ${completed}/${files.length} 篇 · ${Math.round((offset + bytes.length) / file.size * 100)}%`)
              }
              const result = await rpc('uploadFinish', { uploadId })
              uploadId = null
              completed++
              setUploadProgress(`${completed}/${files.length} 篇 · ${result.added ? '正在解析' : '已去重'}`)
            } catch (cause) {
              if (uploadId) await rpc('uploadCancel', { uploadId }).catch(() => {})
              setError(`${file.name}：${cause.message}`)
              break
            }
          }
          if (!cancelUpload.current && completed === files.length) setNotice(`${completed} 篇传输完成，正在逐篇解析。`)
          await refresh()
        } finally {
          setUploadBusy(false)
          setUploadProgress('')
        }
      }

      function settingsPanel() {
        const text = settingsDraft.text
        const image = settingsDraft.image
        const selected = JSON.stringify([text.provider, text.model])
        return h('section', { className: 'dls-card' },
          h('h2', null, '模型设置 · 当前会话'),
          h('div', { className: 'dls-settings' },
            h('div', null,
              h('strong', null, '报告/大纲文本模型'),
              h('label', null, '调用方式'),
              h('select', { className: 'dls-field', value: text.mode,
                onChange: event => setSettingsDraft(previous => ({ ...previous,
                  text: event.target.value === 'dsh'
                    ? { mode: 'dsh', provider: 'deepseek-official', model: 'deepseek-flash' }
                    : { mode: 'custom', baseUrl: '', model: '', apiKey: '' } })) },
              h('option', { value: 'dsh' }, '选择 dsh 已加载模型'),
              h('option', { value: 'custom' }, '独立 OpenAI 兼容 API')),
              text.mode === 'dsh' ? h('div', null,
                h('label', null, 'dsh provider / model'),
                providers.length ? h('select', { className: 'dls-field', value: selected,
                  onChange: event => {
                    const [provider, model] = JSON.parse(event.target.value)
                    setSettingsDraft(previous => ({ ...previous,
                      text: { mode: 'dsh', provider, model } }))
                  } },
                h('option', { value: selected }, `${text.provider}/${text.model}`),
                ...providers.flatMap(provider => provider.models.map(model =>
                  h('option', { key: `${provider.id}:${model.id}`,
                    value: JSON.stringify([provider.id, model.id]) },
                  `${provider.name} · ${model.name}`))))
                  : h('div', null,
                    h('input', { className: 'dls-field', value: text.provider,
                      'aria-label': 'dsh provider', onChange: event => updateSettings('text', 'provider', event.target.value) }),
                    h('input', { className: 'dls-field', value: text.model,
                      'aria-label': 'dsh model', onChange: event => updateSettings('text', 'model', event.target.value) })))
                : h('div', null,
                  h('label', null, '文本 Base URL（例如 https://服务/v1）'),
                  h('input', { className: 'dls-field', value: text.baseUrl || '',
                    onChange: event => updateSettings('text', 'baseUrl', event.target.value) }),
                  h('label', null, '模型名称'),
                  h('input', { className: 'dls-field', value: text.model || '',
                    onChange: event => updateSettings('text', 'model', event.target.value) }),
                  h('label', null, `API Key${text.hasApiKey ? '（已配置，留空表示不变）' : ''}`),
                  h('input', { className: 'dls-field', type: 'password', autoComplete: 'off',
                    value: text.apiKey || '',
                    onChange: event => updateSettings('text', 'apiKey', event.target.value) }),
                  text.hasApiKey && h('label', null,
                    h('input', { type: 'checkbox', checked: !!text.clearApiKey,
                      onChange: event => updateSettings('text', 'clearApiKey', event.target.checked) }),
                    ' 清除已有密钥'))),
            h('div', null,
              h('strong', null, '图片模型（可选）'),
              h('label', null,
                h('input', { type: 'checkbox', checked: !!image.enabled,
                  onChange: event => updateSettings('image', 'enabled', event.target.checked) }),
                ' 启用 AI 概念示意图'),
              image.enabled ? h('div', null,
                h('label', null, '生图 Base URL'),
                h('input', { className: 'dls-field', value: image.baseUrl,
                  onChange: event => updateSettings('image', 'baseUrl', event.target.value) }),
                h('label', null, '图片模型名称'),
                h('input', { className: 'dls-field', value: image.model,
                  onChange: event => updateSettings('image', 'model', event.target.value) }),
                h('label', { htmlFor: uniqueId + '-image-timeout' }, '单张图片最长等待（秒）'),
                h('input', { id: uniqueId + '-image-timeout', className: 'dls-field', type: 'number',
                  min: 30, max: 1800, step: 1, value: image.timeoutSeconds ?? 600,
                  onChange: event => updateSettings('image', 'timeoutSeconds', Number(event.target.value)) }),
                h('p', { className: 'dls-muted dls-help' }, '本机大模型首次生图可能较慢，默认等待 10 分钟；失败后保留正文，以流程图补位。'),
                h('label', null, `API Key${image.hasApiKey ? '（已配置，留空表示不变）' : '（本机可留空）'}`),
                h('input', { className: 'dls-field', type: 'password', autoComplete: 'off',
                  value: image.apiKey || '',
                  onChange: event => updateSettings('image', 'apiKey', event.target.value) }),
                image.hasApiKey && h('label', null,
                  h('input', { type: 'checkbox', checked: !!image.clearApiKey,
                    onChange: event => updateSettings('image', 'clearApiKey', event.target.checked) }),
                  ' 清除已有密钥'))
                : h('p', { className: 'dls-muted' }, '关闭时完全不请求生图接口；仅使用文献原图、流程图和证据表。'))),
          h('p', { className: 'dls-muted' },
            '独立 API 密钥只保存在本机会话私有数据库，读取设置不会回传明文；使用云端模型前请确认文献许可。'),
          button('保存模型设置', () => action(async () => {
            setSettingsDraft(await rpc('saveSettings', { settings: settingsDraft }))
            setNotice('模型设置已保存。已有大纲或报告不会自动修改。')
          }), busy || running))
      }


      function openDocument() {
        return action(async () => {
          if (!item) throw new Error('请先生成成稿')
          if (dirty && documentDraft?.id !== item.id &&
              !window.confirm('打开新稿会放弃尚未保存的修改，继续吗？')) return
          setDocumentDraft(await rpc('getDocument', { kind: outputKind, id: item.id }))
          setDirty(false)
          setPanel('content')
        })
      }
      function editContent(update) {
        setDocumentDraft(previous => {
          const copy = structuredClone(previous)
          update(copy.data)
          return copy
        })
        setDirty(true)
      }
      function changeKind(kind) {
        if (outputKind === kind) return
        if ((dirty || draft) && !window.confirm('切换创作类型会放弃尚未保存的修改，继续吗？')) return
        setOutputKind(kind)
        setDocumentDraft(null)
        setDraft(null)
        setDirty(false)
        setPreview(null)
        setPanel('content')
      }
      function generate() {
        return action(async () => {
          if ((dirty || draft) && !window.confirm('生成新稿会放弃尚未保存的修改，继续吗？')) return
          const result = await rpc(outputKind === 'report' ? 'generateReport' : 'generateDeck',
            { prompt: prompt.trim(), sourceIds, includeWeb,
              format: outputKind === 'report' ? reportFormat : deckFormat })
          setDocumentDraft(null)
          setDraft(null)
          setDirty(false)
          setPreview(null)
          setPanel('content')
          setNotice(result.reused ? '已复用同一版本的成稿，可打开正文或预览。'
            : '完整成稿任务已开始，可在顶部查看进度。')
        })
      }
      function saveContent() {
        return action(async () => {
          const result = await rpc('saveDocument', documentDraft)
          setSaveJob({ id: result.job.id, kind: documentDraft.kind })
          setNotice('正在重新排版；不会让文本模型重写你的修改。原导出文件保留。')
        })
      }
      function textField(label, value, onChange, maxLength, multiline = false) {
        return h(multiline ? 'textarea' : 'input', { className: 'dls-field' + (multiline ? ' dls-textarea' : ''),
          'aria-label': label, value: value || '', maxLength, disabled: locked, onChange: event => onChange(event.target.value) })
      }
      function claimEditor(claim, label, update, limit = 900) {
        return h('div', { className: 'dls-claim', key: label },
          textField(label, claim.text, update, limit, true),
          h('div', { className: 'dls-ref' }, 'PDF 引用：', claim.evidenceIds?.join(' · ') || '无',
            claim.webIds?.length ? ' · 网络：' + claim.webIds.join(' · ') : ''))
      }
      function contentEditor() {
        const data = documentDraft.data
        return h('div', null,
          h('div', { className: 'dls-paper' },
            h('h2', null, outputKind === 'report' ? '报告正文' : '演示文稿正文'),
            h('p', { className: 'dls-muted' }, '编辑真实成稿，不是大纲。引用与素材来源保持不变，修改结论后请自行核对证据。'),
            textField('成稿总标题', data.title, title => editContent(copy => { copy.title = title }), 140),
            h('div', { className: 'dls-actions' },
              button(saveJob ? '正在保存…' : '保存并重新排版', saveContent, !dirty || locked),
              button('放弃修改', () => {
                if (dirty && !window.confirm('放弃尚未保存的正文修改？')) return
                setDocumentDraft(null); setDirty(false)
              }, locked, true),
              h('span', { className: 'dls-muted' }, dirty ? '尚未保存 · 刷新页面会丢失' : '已加载成稿'))),
          outputKind === 'report'
            ? h('div', null,
              h('article', { className: 'dls-paper' }, h('h2', null, '摘要'),
                data.overview.map((claim, index) => claimEditor(claim, '摘要 ' + (index + 1),
                  text => editContent(copy => { copy.overview[index].text = text })))),
              data.sections.map((section, index) => h('article', { className: 'dls-paper', key: index },
                textField('第 ' + (index + 1) + ' 节标题', section.title,
                  title => editContent(copy => { copy.sections[index].title = title }), 100),
                section.paragraphs.map((claim, paragraphIndex) => claimEditor(claim,
                  '第 ' + (index + 1) + ' 节段落 ' + (paragraphIndex + 1),
                  text => editContent(copy => { copy.sections[index].paragraphs[paragraphIndex].text = text }))),
                h('p', { className: 'dls-muted' }, '本节插图与表格保留，排版效果请查看 PDF 预览。'))),
              data.tableRows?.length > 0 && h('article', { className: 'dls-paper' },
                h('h2', null, '文献证据对照表'),
                data.tableRows.map((row, index) => claimEditor({ ...row, text: row.finding },
                  '表格结论 ' + (index + 1), text => editContent(copy => { copy.tableRows[index].finding = text }), 250))))
            : data.slides.map((slide, index) => h('article', { className: 'dls-paper', key: index },
              h('div', { className: 'dls-section-head' }, h('span', { className: 'dls-badge' }, '第 ' + (index + 1) + ' 页'),
                h('span', { className: 'dls-muted' }, visualName(slide.visualKind))),
              textField('第 ' + (index + 1) + ' 页标题', slide.title,
                title => editContent(copy => { copy.slides[index].title = title }), 70),
              slide.takeaway && claimEditor(slide.takeaway, '第 ' + (index + 1) + ' 页核心结论',
                text => editContent(copy => { copy.slides[index].takeaway.text = text }), 120),
              slide.points.map((point, pointIndex) => claimEditor(point,
                '第 ' + (index + 1) + ' 页论述 ' + (pointIndex + 1),
                text => editContent(copy => { copy.slides[index].points[pointIndex].text = text }), 145)),
              h('details', null, h('summary', null, '讲者备注'),
                textField('第 ' + (index + 1) + ' 页讲者备注', slide.speakerNotes,
                  text => editContent(copy => { copy.slides[index].speakerNotes = text }), 1200, true)))),
          data.webSources?.length > 0 && h('div', { className: 'dls-paper' }, h('h3', null, '网络背景来源'),
            data.webSources.map(source => h('p', { key: source.id },
              source.id + ' · ', h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.title)))))
      }
      function outlineEditor() {
        return h('div', { className: 'dls-paper' },
          h('h2', null, '大纲 · 可选步骤'),
          h('p', { className: 'dls-muted' }, '先调整叙事顺序，再逐页综合文献生成详细正文。不是最终成稿。'),
          h('div', { className: 'dls-actions' },
            button('生成大纲', () => action(async () => {
              await rpc('generateOutline', { prompt: prompt.trim(), sourceIds, includeWeb })
              setNotice('大纲任务已启动。')
            }), locked || uploadBusy || !sourceIds.length || !prompt.trim() || !!draft, true),
            outline && !draft && button('编辑大纲', () => {
              setEditRevision(outline.revision); setDraft(structuredClone(outline.data))
            }, locked, true),
            draft && button('保存大纲', () => action(async () => {
              await rpc('saveOutline', { outline: draft, revision: editRevision })
              setDraft(null); setEditRevision(null); setNotice('大纲已保存。')
            }), locked),
            draft && button('取消大纲修改', () => {
              if (window.confirm('放弃未保存的大纲修改？')) setDraft(null)
            }, locked, true),
            outline && !draft && button('按大纲生成详细成稿', () => action(async () => {
              await rpc('renderDeck', { revision: outline.revision, format: deckFormat })
              setDocumentDraft(null); setPreview(null); setPanel('content')
              setNotice('已启动逐页证据成稿与导出。')
            }), locked || dirty)),
          current && h('div', null,
            draft ? textField('大纲总标题', draft.title, title => setDraft({ ...draft, title }), 140)
              : h('h3', null, current.title),
            current.slides.map((slide, index) => h('details', { key: index, open: draft ? true : undefined },
              h('summary', null, '第 ' + (index + 1) + ' 页 · ' + slide.title),
              draft && h('div', { className: 'dls-actions' },
                button('上移', () => moveSlide(index, -1), locked || index <= 1, true),
                button('下移', () => moveSlide(index, 1), locked || index === 0 || index === current.slides.length - 1, true)),
              draft && textField('大纲第 ' + (index + 1) + ' 页标题', slide.title,
                title => changeSlide(index, item => { item.title = title }), 70),
              slide.points.map((point, pointIndex) => h('div', { className: 'dls-claim', key: pointIndex },
                draft ? textField('大纲第 ' + (index + 1) + ' 页论点 ' + (pointIndex + 1),
                  point.text, text => changeSlide(index, item => { item.points[pointIndex].text = text }), 100, true)
                  : h('p', null, point.text),
                h('div', { className: 'dls-ref' }, point.evidenceIds.join(' · ')))),
              draft && slide.visualKind === 'flow' && textField('大纲第 ' + (index + 1) + ' 页流程节点',
                slide.flowNodes.join('\n'), value => changeSlide(index, item => {
                  item.flowNodes = value.split('\n').slice(0, 5)
                }), 250, true))),
            h('p', { className: 'dls-muted' }, '参考文献页在导出时自动生成。')))
      }
      function visualName(kind) {
        return ({ paper: '文献原图', flow: '可编辑流程图', table: '证据表格', generated: 'AI 示意图' })[kind] || kind
      }
      function stateLabel(state) {
        return ({ running: '进行中', succeeded: '完成', failed: '失败', interrupted: '中断' })[state] || state
      }
      function jobKindLabel(kind) {
        return ({ import: '导入文献', outline: '生成大纲', report: '生成报告', deck: '生成演示',
          render: '重新排版', retry: '重试解析' })[kind] || kind
      }
      function jobTimestamp(iso) {
        const time = Date.parse(iso)
        if (!Number.isFinite(time)) return ''
        return new Date(time).toLocaleString('zh-CN',
          { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      }
      function jobDuration(job) {
        const start = Date.parse(job.created_at)
        const end = Date.parse(job.updated_at)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
        const seconds = Math.round((end - start) / 1000)
        return seconds >= 60 ? Math.floor(seconds / 60) + ' 分 ' + (seconds % 60) + ' 秒' : seconds + ' 秒'
      }

      const sources = snapshot?.sources || []
      const sourceIds = sources.filter(source => source.status === 'ready' && !excludedIds.includes(source.id)).map(source => source.id)
      const jobs = snapshot?.jobs || []
      const running = jobs.some(job => job.state === 'running')
      const locked = busy || running || !!saveJob
      const outline = snapshot?.outline
      const current = draft || outline?.data
      const deck = snapshot?.deck
      const report = snapshot?.report
      const item = outputKind === 'report' ? report : deck
      const ready = outputKind === 'report' ? report?.ready : !!deck
      const canPreview = outputKind === 'report' ? report?.ready : deck?.hasPdf
      const format = outputKind === 'report' ? reportFormat : deckFormat
      const latestJob = jobs.find(job => job.state === 'running') || jobs.find(job => job.kind !== 'import') || jobs[0]
      const warning = latestJob?.state === 'succeeded' && latestJob.phase !== '完成'
      const activePreview = preview?.kind === outputKind && preview.id === item?.id ? preview : null

      return h('section', { className: 'dls', 'aria-label': 'NotebookStudio 工作台' },
        h('header', { className: 'dls-head' },
          h('div', { className: 'dls-brand' },
            button('← 返回对话', onExit, false, true),
            h('div', { className: 'dls-project' }, h('h1', null, 'Notebook Studio'),
              h('p', { className: 'dls-muted', title: snapshot?.projectPath || snapshot?.projectTitle },
                snapshot?.projectTitle ? '项目 · ' + snapshot.projectTitle : '正在加载文献项目…'))),
          h('div', { className: 'dls-actions' },
            button('⚙ 模型设置', () => action(async () => {
              setSettingsDraft(await rpc('getSettings')); setSettingsOpen(true)
            }), busy, true),
            button('导出 ' + format.toUpperCase(), () => download(outputKind === 'report'
              ? 'report-' + format : format === 'pdf' ? 'deck-pdf' : 'pptx'), busy || dirty || !!saveJob || !ready || format === 'pdf' && !canPreview, true),
            button(outputKind === 'report' ? '生成完整报告' : '生成完整演示', generate,
              locked || uploadBusy || !prompt.trim() || !sourceIds.length))),
        h('div', { className: 'dls-strip' },
          h('div', { className: 'dls-actions' },
            button(showLibrary ? '收起资料库' : '展开资料库', () => setShowLibrary(!showLibrary), false, true),
            button(showControls ? '收起创作设置' : '展开创作设置', () => setShowControls(!showControls), false, true),
            h('span', { className: 'dls-muted' }, dirty ? '有未保存正文 · 保存后再导出' : '已选 ' + sourceIds.length + '/' + sources.length + ' 篇')),
          h('div', { className: 'dls-status' + (warning ? ' warning' : latestJob?.state === 'failed' ? ' failed' : ''), role: 'status' },
            latestJob ? stateLabel(latestJob.state) + ' · ' + (latestJob.error || latestJob.phase) : '上传文献，开始创作')),
        h('div', { className: 'dls-notices' },
          error && h('div', { className: 'dls-errorbox', role: 'alert' }, error),
          notice && h('div', { className: 'dls-okbox', role: 'status' }, notice),
          snapshot?.outputWarning && h('div', { className: 'dls-errorbox' }, snapshot.outputWarning)),
        h('div', { className: 'dls-grid' + (!showLibrary ? ' no-left' : '') + (!showControls ? ' no-right' : '') },
          showLibrary && h('aside', { className: 'dls-side dls-library', 'aria-label': '资料库' },
            h('div', { className: 'dls-section-head' }, h('h2', null, '资料库'),
              h('span', { className: 'dls-muted' }, sources.length + ' / 30')),
            h('p', { className: 'dls-muted' }, '每篇小于 30 MB。也可从对话上传 PDF。'),
            h('div', { className: 'dls-upload' },
              [['选择 PDF', false], ['选择文件夹', true]].map(([label, folder]) =>
                h('label', { className: 'dls-btn secondary', key: label }, label,
                  h('input', { type: 'file', 'aria-label': label, multiple: true,
                    ...(folder ? { webkitdirectory: '', directory: '' } : { accept: '.pdf,application/pdf' }),
                    disabled: uploadBusy, onChange: event => {
                      void uploadFiles(event.target.files); event.target.value = ''
                    } }))),
              uploadBusy && button('取消上传', () => { cancelUpload.current = true }, false, true)),
            uploadProgress && h('p', { className: 'dls-muted', role: 'status' }, uploadProgress),
            h('div', { className: 'dls-toolbar' },
              button('全选', () => setExcludedIds([]), !sources.length, true),
              button('清空选择', () => setExcludedIds(sources.map(source => source.id)), !sources.length, true)),
            !sources.length && h('p', { className: 'dls-muted' }, '还没有文献。一次可选择最多 30 篇 PDF；扫描件暂不支持。'),
            h('div', { className: 'dls-sources' }, sources.map(source =>
              h('div', { className: 'dls-source', key: source.id },
                h('label', { className: 'dls-pick' },
                  h('input', { type: 'checkbox', 'aria-label': '用于生成：' + source.name,
                    disabled: source.status !== 'ready', checked: source.status === 'ready' && !excludedIds.includes(source.id),
                    onChange: event => setExcludedIds(previous => event.target.checked
                      ? previous.filter(id => id !== source.id) : [...previous, source.id]) }),
                  h('div', { className: 'dls-source-name' }, h('strong', null, source.title || source.name),
                    h('div', { className: 'dls-source-file' }, source.name),
                    h('div', { className: 'dls-source-meta' },
                      h('span', { className: 'dls-badge' + (source.status === 'error' ? ' error' : '') },
                        ({ ready: '已索引', queued: '待解析', indexing: '解析中', error: '失败' })[source.status] || source.status),
                      h('span', { className: 'dls-muted' }, source.page_count
                        ? source.page_count + ' 页 · ' + source.figure_count + ' 图' : (source.bytes / 1e6).toFixed(1) + ' MB')))),
                source.error && h('p', { className: 'dls-error' }, source.error),
                source.status === 'error' && button('重试解析', () => action(async () => {
                  await rpc('retrySource', { sourceId: source.id }); setNotice('已重新排队')
                }), busy, true)))),
            snapshot?.importErrors?.map(entry => h('p', { className: 'dls-error', key: entry.sendId + ':' + entry.name },
              entry.name + '：' + entry.error)),
            h('details', null, h('summary', null, '检索文献证据'),
              h('div', { className: 'dls-search' },
                h('input', { className: 'dls-field', value: query, placeholder: '中英文关键词', 'aria-label': '检索关键词',
                  onChange: event => setQuery(event.target.value),
                  onKeyDown: event => { if (event.key === 'Enter') event.currentTarget.nextSibling?.click() } }),
                button('检索', () => action(async () => setResults(await rpc('search', { query: query.trim() }))),
                  busy || !query.trim())),
              results?.length === 0 && h('p', { className: 'dls-muted' }, '未找到证据，请尝试更明确的术语。'),
              results?.map(row => h('div', { className: 'dls-result', key: row.evidenceId },
                h('strong', null, (row.title || row.name) + ' · 第 ' + row.page + ' 页'),
                h('div', { className: 'dls-ref' }, row.evidenceId), h('p', null, row.excerpt)))),
            h('details', null, h('summary', null, '任务记录' + (jobs.length ? '（' + jobs.length + '）' : '')),
              h('div', { className: 'dls-history' }, jobs.map(job => h('div', { className: 'dls-source', key: job.id },
                h('p', null, jobKindLabel(job.kind)
                  + (jobTimestamp(job.created_at) ? ' · ' + jobTimestamp(job.created_at) : '')),
                h('p', { className: job.error ? 'dls-error' : 'dls-muted' },
                  (job.error || stateLabel(job.state))
                  + (job.state !== 'running' && job.phase && job.phase !== stateLabel(job.state) ? ' · ' + job.phase : '')
                  + (jobDuration(job) ? ' · 耗时 ' + jobDuration(job) : '')))))),
            h('p', { className: 'dls-muted' }, 'Notebook Studio' + (snapshot?.version ? ' · v' + snapshot.version : ''))),
          h('main', { className: 'dls-center', 'aria-label': '内容工作台' },
            h('div', { className: 'dls-center-head' },
              h('nav', { className: 'dls-tabs', 'aria-label': '内容视图' },
                [['content', '正文'], ['preview', '预览'], ...(outputKind === 'deck' ? [['outline', '大纲']] : [])]
                  .map(([id, label]) => h('button', { type: 'button', key: id, 'aria-current': panel === id ? 'page' : undefined,
                    onClick: () => setPanel(id) }, label))),
              h('span', { className: 'dls-muted' }, outputKind === 'report' ? '图文报告 · DOCX / PDF' : '演示文稿 · PPTX / PDF')),
            h('div', { className: 'dls-canvas' },
              panel === 'outline' && outlineEditor(),
              panel === 'content' && documentDraft?.kind === outputKind && contentEditor(),
              panel === 'content' && documentDraft?.kind !== outputKind && h('div', { className: 'dls-empty' },
                h('div', { className: 'dls-empty-mark', 'aria-hidden': true }, ready ? '✓' : '▤'),
                h('h2', null, item ? (outputKind === 'report' ? item.title : '演示文稿已生成') : '让文献成为有逻辑的作品'),
                h('p', null, item ? '打开完整正文继续编辑，或预览图文排版效果。新生成的文件同时保存在当前会话工作区。'
                  : '选好左侧文献，在右侧说明主题、受众与重点。系统会综合原文证据，组织正文并搭配合适的图表。'),
                h('div', { className: 'dls-actions' },
                  item && button('打开正文编辑', openDocument, locked),
                  canPreview && button('预览成稿', () => previewDocument(outputKind), busy, true)),
                !ready && !running && h('p', { className: 'dls-muted' }, '先选资料 → 描述目标 → 生成完整成稿'),
                running && h('p', { className: 'dls-muted' }, '任务在后台运行，可返回对话，稍后再来查看。')) ,
              panel === 'preview' && h('div', null,
                h('div', { className: 'dls-toolbar' },
                  h('span', { className: 'dls-muted' }, dirty ? '此处是上次保存的版本；请先保存修改以更新预览。' : '使用导出 PDF 预览图文排版'),
                  button(activePreview ? '刷新预览' : '加载预览', () => previewDocument(outputKind), busy || !canPreview, true)),
                activePreview ? h('div', null,
                  h('iframe', { className: 'dls-preview', src: activePreview.url, title: activePreview.title + ' PDF 预览' }),
                  h('a', { href: activePreview.url, target: '_blank', rel: 'noopener noreferrer' }, '新窗口打开 PDF'))
                  : h('div', { className: 'dls-empty' }, h('h2', null, canPreview ? '成稿已就绪' : '等待第一份成稿'),
                    h('p', null, canPreview ? '点击「加载预览」查看 PDF。移动端也可在新窗口打开。' : '生成完成后，可在这里查看图文效果。'))),
              item && panel !== 'outline' && h('details', { className: 'dls-paper' }, h('summary', null, '文件与来源'),
                item.outputDirectory && h('p', { className: 'dls-path' }, item.outputDirectory),
                h('div', { className: 'dls-actions' },
                  ready && button('下载来源清单', () => download(outputKind === 'report' ? 'report-manifest' : 'deck-manifest'), busy, true),
                  outputKind === 'report' && button('重试报告排版', () => action(async () => {
                    await rpc('renderReport', { reportId: report.id }); setNotice('已重新启动报告排版。')
                  }), locked || dirty, true))))),
          showControls && h('aside', { className: 'dls-side dls-controls', 'aria-label': '创作设置' },
            h('h2', null, '创作设置'),
            h('label', { className: 'dls-field-label' }, '作品类型'),
            h('div', { className: 'dls-mode', 'aria-label': '创作类型' },
              [['deck', '演示文稿'], ['report', '图文报告']].map(([id, label]) => h('button', {
                type: 'button', key: id, 'aria-pressed': outputKind === id, disabled: locked, onClick: () => changeKind(id) }, label))),
            h('label', { className: 'dls-field-label', htmlFor: uniqueId + '-prompt' }, '写作目标'),
            h('textarea', { className: 'dls-field dls-textarea', id: uniqueId + '-prompt', style: { minHeight: 190 },
              value: prompt, maxLength: 1200, 'aria-label': '报告与演示文稿写作提示词',
              onChange: event => setPrompt(event.target.value) }),
            h('p', { className: 'dls-muted' }, '可说明受众、主题、重点、结构与语言。'),
            h('label', { className: 'dls-field-label', htmlFor: uniqueId + '-format' }, '输出格式'),
            h('select', { className: 'dls-field', id: uniqueId + '-format', value: format, 'aria-label': '创作输出格式',
              onChange: event => outputKind === 'report' ? setReportFormat(event.target.value) : setDeckFormat(event.target.value) },
              h('option', { value: outputKind === 'report' ? 'docx' : 'pptx' }, outputKind === 'report' ? 'Word（DOCX）' : 'PowerPoint（PPTX）'),
              h('option', { value: 'pdf' }, 'PDF')),
            h('label', { className: 'dls-field-label' },
              h('input', { type: 'checkbox', checked: includeWeb, onChange: event => setIncludeWeb(event.target.checked) }),
              ' 加入网络搜索参考'),
            includeWeb && h('p', { className: 'dls-muted' }, '仅用提示词检索，网络引用单独标记；搜索不可用时停止任务。'),
            h('div', { className: 'dls-guidance' }, h('strong', null, '从证据到成稿'),
              h('p', { className: 'dls-muted' }, 'PDF 原文支持结论，按内容选择原图、流程图或表格，不固定插图张数。'),
              h('p', { className: 'dls-muted' }, settingsDraft?.image.enabled
                ? '已启用 AI 概念示意图；不作为论文证据。' : '未启用生图模型，仅使用文献图、流程图与表格。'),
              h('p', { className: 'dls-muted' }, '正文编辑草稿仅在本页保留。保存并重新排版后才会更新导出文件。')))),
        settingsOpen && h(Modal, { title: '模型设置', onClose: () => setSettingsOpen(false) },
          h('div', { className: 'dls dls-settings-shell' },
            h('div', { className: 'dls-head' }, h('h2', null, '模型与 API'),
              button('关闭设置', () => setSettingsOpen(false), false, true)),
            h('div', { className: 'dls-settings-body' }, settingsDraft && settingsPanel()))))
    }

    function StudioPage({ sessionId, onExit }) {
      // 全局面板通过 session-maybe 子槽取得宿主当前会话，不猜测或自动创建项目。
      if (sessionId) return h(StudioView, { key: sessionId, sessionId, onExit })
      return h('section', { className: 'dls dls-welcome', 'aria-label': 'NotebookStudio 工作台' },
        h('h1', null, 'NotebookStudio'),
        h('div', { className: 'dls-empty' },
          h('h2', null, '先选择一个会话'),
          h('p', null, '每个会话对应独立的文献项目。请在左侧选择已有会话，或新建会话，再进入 NotebookStudio 整理文献、编辑与生成。'),
          button('返回对话', onExit, false, true)))
    }

    function StudioIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false },
        h('rect', { x: 5, y: 3, width: 15, height: 18, rx: 2 }),
        h('path', { d: 'M9 3v18M3 7h4M3 12h4M3 17h4M12 8h5M12 12h5M12 16h3' }))
    }

    let thisConnection
    function apply(ctx) {
      thisConnection = ctx.connection
      const style = document.createElement('style')
      style.textContent = css
      style.dataset.pluginCss = 'dsh-notebook-studio'
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove(); workspaces.clear() }, 'Notebook Studio 样式')
      // 复用宿主主面板与会话作用域，保留左侧导航；退出不改变当前会话。
      ctx.slots.inject('main', function* () {
        yield ctx.slots.register({
          name: 'main', key: 'notebook-studio',
          children: { 'notebook-studio.session': { kind: 'single', scope: 'session-maybe' } },
        }, ({ renderSlot }) => renderSlot('notebook-studio.session', {}))
        yield ctx.slots.register({
          name: 'notebook-studio.session', inject: () => ({ onExit: () => ctx.layout.selectPanel(null) }),
        }, StudioPage)
      })
      // 宿主「插件」的顺序为 0；行样式、选中态和折叠提示均由宿主管理。
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: 'notebook-studio', order: -10, label: 'NotebookStudio',
      }, StudioIcon))
    }
    return { inject, apply }
  },
})
