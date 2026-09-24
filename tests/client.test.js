import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function loadClient() {
  const entries = new Map()
  const declarations = new Set(['main', 'sidebar.panellist'])
  const cleanup = []
  const styles = []
  const navigation = []
  let plugin
  const react = { createElement: (type, props, ...children) => ({ type, props, children }) }
  const context = {
    connection: { rpc: { call: () => assert.fail('未进入会话时不得调用 RPC') } },
    layout: { selectPanel: panel => navigation.push(panel) },
    effect: callback => cleanup.push(callback()),
    slots: {
      inject(name, callback) {
        assert.ok(declarations.has(name))
        const result = callback()
        if (typeof result === 'function') cleanup.push(result)
        else for (const dispose of result) cleanup.push(dispose)
      },
      register(options, component) {
        assert.ok(declarations.has(options.name))
        const entry = { options, component }
        entries.set(options.name, entry)
        for (const child of Object.keys(options.children || {})) declarations.add(child)
        return () => entries.delete(options.name)
      },
    },
  }
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: definition => {
      plugin = definition.factory(name => { assert.equal(name, 'react'); return react })
    } } },
    document: {
      createElement: () => ({ dataset: {}, remove() { styles.splice(styles.indexOf(this), 1) } }),
      head: { appendChild: style => styles.push(style) },
    },
  })
  plugin.apply(context)
  return { entries, navigation, styles, plugin, dispose: () => cleanup.reverse().forEach(callback => callback()) }
}

test('客户端只注册侧栏入口和主面板，位于插件入口之前且可清理', () => {
  const client = loadClient()
  assert.deepEqual([...client.entries.keys()], ['main', 'notebook-studio.session', 'sidebar.panellist'])
  const panel = client.entries.get('main')
  const sidebar = client.entries.get('sidebar.panellist')
  assert.equal(sidebar.options.label, 'NotebookStudio')
  assert.equal(sidebar.options.id, panel.options.key)
  assert.ok(sidebar.options.order < 0)
  assert.equal(panel.options.children['notebook-studio.session'].scope, 'session-maybe')
  assert.ok(client.plugin.inject.includes('layout'))
  assert.ok(client.plugin.inject.includes('uiSession'))
  const icon = sidebar.component({ size: 18, active: true })
  assert.equal(icon.type, 'svg')
  assert.equal(icon.props.width, 18)
  assert.equal(icon.props.stroke, 'currentColor')
  assert.equal(client.styles.length, 1)
  client.dispose()
  assert.equal(client.entries.size, 0)
  assert.equal(client.styles.length, 0)
})

test('主面板使用宿主会话作用域，无会话展示指引而不猜测项目', () => {
  const client = loadClient()
  const panel = client.entries.get('main')
  const session = client.entries.get('notebook-studio.session')
  const callbacks = session.options.inject()
  const render = sessionId => panel.component({ renderSlot(name) {
    assert.equal(name, 'notebook-studio.session')
    return session.component({ sessionId, ...callbacks })
  } })
  const empty = render(undefined)
  assert.equal(empty.type, 'section')
  assert.match(JSON.stringify(empty), /先选择一个会话/)
  assert.doesNotMatch(JSON.stringify(empty), /报告与演示文稿写作提示词/)
  empty.children[1].children[2].props.onClick()
  assert.deepEqual(client.navigation, [null])
  const first = render('session-a')
  const second = render('session-b')
  assert.equal(first.props.sessionId, 'session-a')
  assert.equal(first.props.key, 'session-a')
  assert.equal(second.props.key, 'session-b')
  first.props.onExit()
  assert.deepEqual(client.navigation, [null, null])
  client.dispose()
})

test('Studio 配色使用宿主语义变量，不保留旧青绿色主题', () => {
  const client = loadClient()
  const css = client.styles[0].textContent
  for (const token of ['button-primary-fill', 'button-primary-hover', 'label-primary-inverted',
    'bg-base', 'brand-primary', 'state-error-primary', 'state-warn-primary', 'bg-mask-1']) {
    assert.ok(css.includes(`var(--dsw-alias-${token})`), token)
  }
  // PDF 预览是文档白纸，界面其余颜色必须由宿主控制。
  assert.deepEqual(Array.from(css.matchAll(/#[\da-f]{3,8}\b/gi), match => match[0]), ['#fff'])
  client.dispose()
})
