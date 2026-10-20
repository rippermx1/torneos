import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ index: 0, frame: { contentWindow: { postMessage: vi.fn() }, focus: vi.fn(), src: '' },
  view: { focus: vi.fn() }, cleanups: [] as (() => void)[], move: vi.fn(), destroy: vi.fn() }))
vi.mock('react', () => ({
  useId: () => 'navigation-guide',
  useRef: () => ({ current: [fixture.frame, null, null, null, fixture.view][fixture.index++] ?? null }),
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
  useLayoutEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
}))
vi.mock('../unity-2048-session', async () => ({ ...await vi.importActual('../unity-2048-session'),
  Unity2048Session: class { move = fixture.move; destroy = fixture.destroy; tick = vi.fn()
    snapshot = () => ({ cells: [2,4,...Array(14).fill(0)], score: 4, started: true })
  } }))
import { Unity2048 } from '@/components/game/unity-2048'
import { UNITY_2048_BUILD, UNITY_2048_CHANNEL } from '../unity-2048-session'
let motion: EventTarget & { matches: boolean }
const navigation = { channel: UNITY_2048_CHANNEL, version: 1, build_id: UNITY_2048_BUILD, type: 'game.navigation', key: 'Escape', shift: false }
function receive(data: unknown, origin = 'http://local.test', source: unknown = fixture.frame.contentWindow) {
  window.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }))
}
beforeEach(() => {
  fixture.index = 0; fixture.cleanups = []; vi.clearAllMocks(); vi.useFakeTimers()
  motion = Object.assign(new EventTarget(), { matches: true })
  vi.stubGlobal('window', Object.assign(new EventTarget(), { matchMedia: () => motion }))
  vi.stubGlobal('document', new EventTarget()); vi.stubGlobal('location', { origin: 'http://local.test' })
  Unity2048({})
})
afterEach(() => { fixture.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); vi.useRealTimers() })
it('returns focus on Escape from the capsule without sending a move', () => {
  expect(fixture.frame.focus).not.toHaveBeenCalled()
  receive(navigation)
  expect(fixture.view.focus).toHaveBeenCalledTimes(1); expect(fixture.move).not.toHaveBeenCalled()
})
it('ignores Escape from another origin, frame, build or protocol', () => {
  receive(navigation, 'http://foreign.test'); receive(navigation, 'http://local.test', {})
  receive({ ...navigation, build_id: 'obsolete' }); receive({ ...navigation, version: 2 })
  expect(fixture.view.focus).not.toHaveBeenCalled()
})
it('publishes reduced motion on load and on preference changes without changing the board', () => {
  receive({ channel: UNITY_2048_CHANNEL, version: 1, type: 'game.ready', build_id: UNITY_2048_BUILD })
  const first = fixture.frame.contentWindow.postMessage.mock.calls.at(-1)?.[0]
  expect(first.state.reduced_motion).toBe(true)
  motion.matches = false; motion.dispatchEvent(new Event('change'))
  const second = fixture.frame.contentWindow.postMessage.mock.calls.at(-1)?.[0]
  expect(second.state.reduced_motion).toBe(false); expect(second.state.cells).toEqual(first.state.cells)
})
it('removes navigation and preference listeners on unmount', () => {
  fixture.cleanups.forEach(cleanup => cleanup()); fixture.cleanups = []
  receive(navigation); motion.dispatchEvent(new Event('change'))
  expect(fixture.view.focus).not.toHaveBeenCalled(); expect(fixture.frame.contentWindow.postMessage).not.toHaveBeenCalled()
  expect(fixture.destroy).toHaveBeenCalledTimes(1)
})
