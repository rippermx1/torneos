import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ cleanups: [] as (() => void)[], tick: vi.fn(), resync: vi.fn(), destroy: vi.fn() }))
vi.mock('react', () => ({
  useId: () => 'clock-guide',
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup) },
  useLayoutEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup) },
}))
vi.mock('../unity-2048-session', () => ({
  UNITY_2048_BUILD: 'clock-test', UNITY_2048_CHANNEL: 'torneos.2048', parseUnity2048Input: vi.fn(),
  Unity2048Session: class { tick = hooks.tick; resynchronizeTime = hooks.resync; destroy = hooks.destroy },
}))
import { Unity2048 } from '@/components/game/unity-2048'

let hostWindow: EventTarget, hostDocument: EventTarget & { visibilityState: string }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); hooks.cleanups = []
  hostWindow = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false,
    addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  hostDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('window', hostWindow); vi.stubGlobal('document', hostDocument)
  Unity2048({ tournament: { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' } })
})
afterEach(() => { for (const cleanup of hooks.cleanups) cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('queries time on visibility return, while hidden events do not query', () => {
  hostDocument.visibilityState = 'hidden'; hostDocument.dispatchEvent(new Event('visibilitychange'))
  expect(hooks.resync).not.toHaveBeenCalled()
  hostDocument.visibilityState = 'visible'; hostDocument.dispatchEvent(new Event('visibilitychange'))
  expect(hooks.resync).toHaveBeenCalledTimes(1)
})
it('queries time when restored from browser cache, without duplicating initial page load', () => {
  hostWindow.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }))
  expect(hooks.resync).not.toHaveBeenCalled()
  hostWindow.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  expect(hooks.resync).toHaveBeenCalledTimes(1)
})
it('keeps a one-second ticker and removes lifecycle listeners and timers on unmount', () => {
  vi.advanceTimersByTime(3000); expect(hooks.tick).toHaveBeenCalledTimes(3)
  for (const cleanup of hooks.cleanups) cleanup(); hooks.cleanups = []
  hostDocument.dispatchEvent(new Event('visibilitychange'))
  hostWindow.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  vi.advanceTimersByTime(3000)
  expect(hooks.resync).not.toHaveBeenCalled(); expect(hooks.tick).toHaveBeenCalledTimes(3)
  expect(hooks.destroy).toHaveBeenCalledTimes(1)
})
