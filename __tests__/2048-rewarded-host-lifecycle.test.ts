import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RewardedController, type RewardedSnapshot } from '@/lib/ads/rewarded'

const fixture = vi.hoisted(() => ({ refIndex: 0, stateIndex: 0,
  refs: [] as { current: unknown }[], cleanups: [] as (() => void)[], constructors: 0,
  frame: { contentWindow: { postMessage: vi.fn() }, src: '' },
  beginTrainingDemo: vi.fn(), failure: '', ready: false,
  locked: false, release: null as (() => void) | null,
  effects: [] as (() => (() => void) | undefined)[], captureEffects: false, rewardSnapshot: null as RewardedSnapshot | null }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useId: () => 'rewarded-lifecycle', useEffect: (effect: () => (() => void) | undefined) => { if (fixture.captureEffects) fixture.effects.push(effect) },
  useRef: () => {
    const index = fixture.refIndex++
    return fixture.refs[index] ??= { current: index === 0 ? fixture.frame : null }
  },
  useState: (initial: unknown) => {
    const index = fixture.stateIndex++
    return [initial, (value: unknown) => {
      if (index === 1) fixture.ready = value === true
      if (index === 2) fixture.failure = value as string
      if (index === 12) fixture.rewardSnapshot = value as RewardedSnapshot
    }]
  },
  useLayoutEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) fixture.cleanups.push(cleanup) },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/game/unity-2048-session', () => ({
  UNITY_2048_CHANNEL: 'torneos.2048', UNITY_2048_BUILD: 'fixture',
  parseUnity2048Input: (value: { type?: string }) => value?.type === 'game.ready' ? 'ready' : null,
  Unity2048Session: class {
    constructor() { fixture.constructors++ }
    snapshot = () => ({ mode: 'practice', started: true, game_over: true, score: 0, training: {
      phase: 'offered', sourceId: '11111111-1111-4111-8111-111111111111',
    } })
    beginTrainingDemo = fixture.beginTrainingDemo
    destroy = vi.fn(); tick = vi.fn(); recover = vi.fn()
  },
}))
import { Unity2048 } from '@/components/game/unity-2048'

const sourceId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  fixture.refIndex = 0; fixture.stateIndex = 0; fixture.refs = []; fixture.cleanups = []
  fixture.failure = ''; fixture.ready = false; fixture.locked = false; fixture.release = null; fixture.constructors = 0
  fixture.effects = []; fixture.captureEffects = false; fixture.rewardSnapshot = null
  fixture.beginTrainingDemo.mockReset().mockReturnValue(true)
  vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-10-19T12:00:00Z'))
  const storage = new Map<string, string>()
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) } },
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  }))
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('location', { origin: 'http://local.test' })
  vi.stubGlobal('navigator', { locks: { request: (_key: string, _options: unknown, work: () => unknown) => fixture.locked
    ? new Promise(resolve => { fixture.release = () => resolve(work()) }) : Promise.resolve(work()) } })
})
afterEach(() => { fixture.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); vi.useRealTimers() })
const controller = () => fixture.refs[7].current as RewardedController
function input(type: string) {
  window.dispatchEvent(Object.assign(new Event('message'), { origin: 'http://local.test', source: fixture.frame.contentWindow,
    data: { channel: 'torneos.2048', version: 1, type } }))
}

it('invalidates a grant waiting on another tab as soon as Unity reports an error', async () => {
  Unity2048({ observationCategory: 'synthetic' })
  const adapter = controller()
  expect(await adapter.request(sourceId)).toBe(true)
  fixture.locked = true
  const grant = adapter.completeDemo(adapter.snapshot().requestId!)
  expect(fixture.release).toBeTypeOf('function')
  input('game.error')
  fixture.release!()
  expect(await grant).toBe(false)
  expect(fixture.beginTrainingDemo).not.toHaveBeenCalled()
  expect(adapter.snapshot().usedToday).toBe(0)
  fixture.locked = false
  expect(await adapter.request(sourceId)).toBe(false)
  expect(fixture.failure).toContain('Unity no pudo cargar')
})

it('keeps the adapter ineligible after a load timeout until a new capsule generation is created', async () => {
  Unity2048({ observationCategory: 'synthetic' })
  const adapter = controller()
  await vi.advanceTimersByTimeAsync(90000)
  expect(fixture.failure).toContain('No se pudo cargar Unity')
  expect(await adapter.request(sourceId)).toBe(false)
  input('game.ready')
  expect(fixture.ready).toBe(false)
  expect(fixture.beginTrainingDemo).not.toHaveBeenCalled()
})

it('destroys the adapter on unmount and never constructs one for competitive play', async () => {
  Unity2048({ observationCategory: 'synthetic' })
  const adapter = controller()
  expect(await adapter.request(sourceId)).toBe(true)
  const oldRequest = adapter.snapshot().requestId!
  fixture.cleanups.splice(0).forEach(cleanup => cleanup())
  expect(await adapter.completeDemo(oldRequest)).toBe(false)
  expect(fixture.refs[7].current).toBeNull()
  expect(fixture.beginTrainingDemo).not.toHaveBeenCalled()
  fixture.refIndex = 0; fixture.stateIndex = 0; fixture.refs = []
  Unity2048({ tournament: { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' } })
  expect(fixture.refs[7].current).toBeNull()
})

it('refreshes an exhausted Chile-day limit through the existing daily load even when that request fails', async () => {
  fixture.captureEffects = true
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Daily unavailable')))
  Unity2048({ observationCategory: 'synthetic' })
  const quota = new RewardedController({ mode: 'demo', category: 'synthetic', getStorage: () => window.localStorage,
    isEligible: () => true, grant: () => true, runExclusive: async work => work() })
  for (const source of ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']) {
    expect(await quota.request(source)).toBe(true)
    expect(await quota.completeDemo(quota.snapshot().requestId!)).toBe(true)
  }
  expect(await controller().request(sourceId)).toBe(false)
  expect(controller().snapshot(sourceId)).toMatchObject({ available: false, remainingToday: 0 })
  vi.setSystemTime(Date.parse('2026-10-20T12:00:00Z'))
  const cleanup = fixture.effects[0]()
  if (cleanup) fixture.cleanups.push(cleanup)
  for (let turn = 0; turn < 5; turn++) await Promise.resolve()
  expect(fixture.rewardSnapshot).toMatchObject({ available: true, usedToday: 0, remainingToday: 2 })
  expect(fetch).toHaveBeenCalledTimes(1)
  quota.destroy()
})
