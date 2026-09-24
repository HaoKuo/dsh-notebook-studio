import { createHash } from 'node:crypto'

export const DEFAULT_SETTINGS = Object.freeze({
  text: { mode: 'dsh', provider: 'deepseek-official', model: 'deepseek-flash' },
  image: { enabled: false, baseUrl: 'http://127.0.0.1:11234/v1',
    model: 'ddalcu/Qwen-Image-2.1-MLX-Serve-8bit', timeoutSeconds: 600 },
})

export function apiEndpoint(value, path) {
  if (typeof value !== 'string' || value.length > 500
      || /%2e|\/\.\.?(?:\/|$)/i.test(value)) throw new Error('API Base URL 无效')
  let base
  try { base = new URL(value.endsWith('/') ? value : `${value}/`) } catch {
    throw new Error('API Base URL 无效')
  }
  if (base.username || base.password || base.search || base.hash
      || !(base.protocol === 'https:' || base.protocol === 'http:'
        && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) {
    throw new Error('API 地址必须是 HTTPS，或本机回环 HTTP，且不能包含凭据或查询参数')
  }
  return new URL(path, base).href
}

function label(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 180) {
    throw new Error(`${field} 无效`)
  }
  return value.trim()
}

function secret(value, old, clear) {
  if (clear === true) return ''
  if (value === undefined || value === '') return old || ''
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) {
    throw new Error('API Key 无效')
  }
  return value
}

export function validateSettings(input, previous = DEFAULT_SETTINGS) {
  if (!input || typeof input !== 'object') throw new Error('模型设置无效')
  const textInput = input.text || {}
  const imageInput = input.image || {}
  const mode = textInput.mode
  if (!['dsh', 'custom'].includes(mode)) throw new Error('请选择文本模型来源')
  const text = mode === 'dsh'
    ? { mode, provider: label(textInput.provider, 'dsh provider'),
      model: label(textInput.model, 'dsh model') }
    : { mode, baseUrl: label(textInput.baseUrl, '文本 Base URL'),
      model: label(textInput.model, '文本模型'),
      apiKey: secret(textInput.apiKey, previous.text.mode === 'custom'
        ? previous.text.apiKey : '', textInput.clearApiKey) }
  if (mode === 'custom') apiEndpoint(text.baseUrl, 'chat/completions')
  if (typeof imageInput.enabled !== 'boolean') throw new Error('请选择是否启用生图')
  const timeoutSeconds = imageInput.timeoutSeconds ?? previous.image.timeoutSeconds ?? 600
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 1800) {
    throw new Error('图片等待时间须为 30–1800 秒的整数')
  }
  const image = { enabled: imageInput.enabled,
    timeoutSeconds,
    baseUrl: label(imageInput.baseUrl || DEFAULT_SETTINGS.image.baseUrl, '生图 Base URL'),
    model: label(imageInput.model || DEFAULT_SETTINGS.image.model, '生图模型'),
    apiKey: secret(imageInput.apiKey, previous.image.apiKey, imageInput.clearApiKey) }
  if (image.enabled) apiEndpoint(image.baseUrl, 'images/generations')
  return { text, image }
}

export function publicSettings(settings) {
  const { text, image } = settings
  return { text: { ...text, apiKey: undefined, hasApiKey: !!text.apiKey },
    image: { ...image, timeoutSeconds: image.timeoutSeconds ?? 600,
      apiKey: undefined, hasApiKey: !!image.apiKey } }
}

export function textFingerprint(settings) {
  return createHash('sha256').update(JSON.stringify(settings.text)).digest('hex')
}
