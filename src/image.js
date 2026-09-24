import { createHash, randomUUID } from 'node:crypto'
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crc32, inflateSync } from 'node:zlib'
import { apiEndpoint } from './settings.js'

const DEFAULT_MODEL = 'ddalcu/Qwen-Image-2.1-MLX-Serve-8bit'
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')

export function imageEndpoint(baseUrl = 'http://127.0.0.1:11234/v1') {
  return apiEndpoint(baseUrl, 'images/generations')
}

export function decodeGeneratedImage(data) {
  const encoded = data?.data?.[0]?.b64_json
  if (typeof encoded !== 'string' || encoded.length > 44 * 1024 * 1024
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('图片接口未返回有效的 base64 PNG')
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length < 32 || bytes.length > 32 * 1024 * 1024
      || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('图片接口返回了损坏或过大的 PNG')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width < 512 || height < 512 || width > 4096 || height > 4096) {
    throw new Error('本地图像接口返回的图片尺寸无效')
  }
  let offset = 8
  let ended = false
  const compressed = []
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    if (length > 32 * 1024 * 1024 || offset + length + 12 > bytes.length) {
      throw new Error('PNG 块长度无效')
    }
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const content = bytes.subarray(offset + 4, offset + 8 + length)
    if (crc32(content) !== bytes.readUInt32BE(offset + 8 + length)) {
      throw new Error('PNG 校验和不匹配')
    }
    if (offset === 8 && (type !== 'IHDR' || length !== 13)) throw new Error('PNG 头无效')
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
    if (type === 'IEND') {
      ended = true
      break
    }
  }
  if (!ended || offset !== bytes.length || !compressed.length
      || bytes[24] !== 8 || ![2, 6].includes(bytes[25]) || bytes[28] !== 0) {
    throw new Error('PNG 数据或颜色格式无效')
  }
  try {
    const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: 70 * 1024 * 1024 })
    if (pixels.length !== height * (1 + width * (bytes[25] === 2 ? 3 : 4))) {
      throw new Error('像素数据长度不匹配')
    }
  } catch (error) {
    throw new Error(`PNG 像素数据损坏：${error.message}`)
  }
  return { bytes, width, height }
}

export async function generateConceptImage(store, prompt, config = {}, options = {}) {
  const endpoint = imageEndpoint(config.baseUrl || config.imageBaseUrl)
  const model = config.model || config.imageModel || DEFAULT_MODEL
  if (!prompt || typeof prompt !== 'string' || prompt.length > 1000) {
    throw new Error('AI 示意图提示词无效')
  }
  const key = createHash('sha256').update(JSON.stringify([endpoint, config.apiKey, model,
    prompt, '1024x1024', 8]))
    .digest('hex')
  const path = join(store.directory, 'generated', `${key}.png`)
  const old = store.asset(key)
  if (old?.model === model && old.path === path) {
    try {
      await access(path)
      return { path, key, reused: true }
    } catch { /* 磁盘文件丢失时重新生成。 */ }
  }
  // 崩溃可能发生在原子写盘与 SQLite 提交之间；先回收已完成的图片。
  try {
    const bytes = await readFile(path)
    const recovered = decodeGeneratedImage({ data: [{ b64_json: bytes.toString('base64') }] })
    store.putAsset(key, prompt, model, path, { width: recovered.width, height: recovered.height })
    return { path, key, reused: true }
  } catch { /* 未完成的图片重新请求本机服务。 */ }

  const timeoutSeconds = config.timeoutSeconds ?? 600
  const deadline = AbortSignal.timeout(options.timeoutMs ?? timeoutSeconds * 1000)
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
  const requestError = error => {
    options.signal?.throwIfAborted()
    if (deadline.aborted || error?.name === 'TimeoutError') {
      return new Error(`图片生成等待超过 ${timeoutSeconds} 秒；请在模型设置中增加等待时间，或检查生图服务负载`)
    }
    return new Error('图片模型连接失败，请检查服务是否启动及 Base URL 是否正确')
  }
  let response
  try {
    response = await (options.fetch || fetch)(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', steps: 8,
        response_format: 'b64_json' }),
      signal,
    })
  } catch (error) {
    throw requestError(error)
  }
  if (!response.ok) throw new Error(`图片模型返回 HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > 44 * 1024 * 1024) {
    throw new Error('本地图片响应过大')
  }
  if (!response.body) throw new Error('图片模型未返回内容')
  const reader = response.body.getReader()
  let size = 0
  const chunks = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 44 * 1024 * 1024) {
        await reader.cancel()
        throw new Error('图片响应过大')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (signal.aborted) throw requestError(error)
    throw error
  } finally { reader.releaseLock() }
  const output = Buffer.concat(chunks).toString('utf8')
  let decoded
  try {
    decoded = decodeGeneratedImage(JSON.parse(output))
  } catch (error) {
    throw new Error(`图片模型返回的素材无效：${error.message}`)
  }
  const staging = join(store.directory, 'generated', `.image-${randomUUID()}.png`)
  try {
    await writeFile(staging, decoded.bytes, { flag: 'wx', mode: 0o600 })
    await rename(staging, path)
    store.putAsset(key, prompt, model, path, { width: decoded.width, height: decoded.height })
  } finally {
    await rm(staging, { force: true })
  }
  return { path, key, reused: false }
}
