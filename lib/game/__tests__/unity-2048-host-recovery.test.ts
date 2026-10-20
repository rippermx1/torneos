import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ index: 0, frame: { contentWindow: { postMessage: vi.fn() }, focus: vi.fn(), src: '' },
  recover: vi.fn(), start: vi.fn(), cleanups: [] as (() => void)[] }))
vi.mock('react', () => ({
  useId: () => 'recovery-guide',
  useRef: () => fixture.index++ === 0 ? { current: fixture.frame } : { current: null },
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
  useLayoutEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
}))
vi.mock('../unity-2048-session', () => ({ UNITY_2048_CHANNEL: 'torneos.2048', UNITY_2048_BUILD: 'fixture',
  parseUnity2048Input: () => 'ready', Unity2048Session: class {
    recover = fixture.recover; start = fixture.start; snapshot = () => ({ score: 0 }); destroy = vi.fn(); tick = vi.fn()
  } }))
import { Unity2048 } from '@/components/game/unity-2048'
const config = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }
beforeEach(() => {
  fixture.index = 0; fixture.cleanups = []; vi.clearAllMocks(); vi.useFakeTimers()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }))
  vi.stubGlobal('document', new EventTarget()); vi.stubGlobal('location', { origin: 'http://local.test' })
})
afterEach(() => { for (const cleanup of fixture.cleanups) cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
function ready() {
  window.dispatchEvent(Object.assign(new Event('message'), { origin: 'http://local.test', source: fixture.frame.contentWindow, data: {} }))
}
it('automatically recovers a known game once Unity is ready, without a new start or duplicates', () => {
  Unity2048({ tournament: { ...config, existingGameId: 'g1' } }); ready(); ready()
  expect(fixture.recover).toHaveBeenCalledTimes(1); expect(fixture.start).not.toHaveBeenCalled()
})
it('requires explicit start for a new tournament game', () => {
  Unity2048({ tournament: config }); ready()
  expect(fixture.recover).not.toHaveBeenCalled(); expect(fixture.start).not.toHaveBeenCalled()
})
