import { readFileSync } from 'node:fs'

/**
 * Web client catalog served through the `getMessages` RPC.
 *
 * Keys are the Chinese source strings used verbatim in this package and in
 * lib/client.js, so a missing translation falls back to the source text instead
 * of rendering an empty label. The client picks the dictionary that matches the
 * dsh locale (en/zh); `zh` is intentionally absent because the source text is
 * already Chinese.
 */
export const MESSAGES = {
  en: JSON.parse(readFileSync(new URL('./messages.en.json', import.meta.url), 'utf8')),
}
