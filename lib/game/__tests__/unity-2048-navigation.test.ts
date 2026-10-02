import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { parseUnity2048Navigation } from '../unity-2048-navigation'
import { UNITY_2048_BUILD, UNITY_2048_CHANNEL } from '../unity-2048-session'

const envelope = { channel: UNITY_2048_CHANNEL, version: 1, build_id: UNITY_2048_BUILD, type: 'game.navigation', key: 'Escape', shift: false }
it.each(['Escape', 'Tab'] as const)('accepts navigation %s for this capsule', key => {
  expect(parseUnity2048Navigation({ ...envelope, key, shift: true })).toEqual({ key, shift: true })
})
it.each([null, { channel: undefined }, { channel: 'other' }, { version: 2 }, { build_id: 'obsolete' }, { type: 'game.input' }, { key: 'ArrowUp' }, { shift: 'false' }])('rejects invalid navigation %j', change => {
  expect(parseUnity2048Navigation(change === null ? null : { ...envelope, ...change })).toBeNull()
})

function capsule() {
  const window = new EventTarget(), parent = { postMessage: vi.fn() }, canvas = { focus: vi.fn() }
  const unity = { SendMessage: vi.fn() }
  const loader: { onload?: () => Promise<unknown>; src?: string } = {}
  const html = readFileSync('games/2048/UnityProject/Assets/WebGLTemplates/Torneos2048/index.html', 'utf8')
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    .replace(/\{\{\{ JSON.stringify\(PRODUCT_VERSION\) \}\}\}/g, JSON.stringify(UNITY_2048_BUILD))
    .replace(/\{\{\{ JSON.stringify\([A-Z_]+\) \}\}\}/g, '"test"')
  runInNewContext(script, { window, parent, location: { origin: 'http://local.test' }, devicePixelRatio: 1,
    document: { getElementById: () => canvas, createElement: () => loader, body: { appendChild: vi.fn() } },
    createUnityInstance: () => Promise.resolve(unity) })
  return { window, parent, canvas, unity, loader }
}
it.each(['Escape', 'Tab'])('forwards %s from the actual template and suppresses Unity handling', key => {
  const bridge = capsule()
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key, shiftKey: true })
  bridge.window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(bridge.parent.postMessage).toHaveBeenCalledWith({ ...envelope, key, shift: true }, 'http://local.test')
})
it.each(['ArrowUp', 'w', 'a', 's', 'd'])('leaves gameplay key %s to Unity', key => {
  const bridge = capsule(), event = Object.assign(new Event('keydown', { cancelable: true }), { key })
  bridge.window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false); expect(bridge.parent.postMessage).not.toHaveBeenCalled()
})
it('does not take focus when Unity finishes loading', async () => {
  const bridge = capsule(); await bridge.loader.onload?.()
  expect(bridge.canvas.focus).not.toHaveBeenCalled()
})
it('focuses the canvas only on a validated request from its own parent', () => {
  const bridge = capsule()
  const data = { channel: UNITY_2048_CHANNEL, version: 1, type: 'platform.focus' }
  for (const [origin, source, value] of [
    ['http://foreign.test', bridge.parent, data], ['http://local.test', {}, data],
    ['http://local.test', bridge.parent, { ...data, version: 2 }],
    ['http://local.test', bridge.parent, { ...data, channel: 'other' }],
  ]) bridge.window.dispatchEvent(Object.assign(new Event('message'), { origin, source, data: value }))
  expect(bridge.canvas.focus).not.toHaveBeenCalled()
  bridge.window.dispatchEvent(Object.assign(new Event('message'), { origin: 'http://local.test', source: bridge.parent, data }))
  expect(bridge.canvas.focus).toHaveBeenCalledTimes(1)
})
