import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Practice2048Recovery } from '@/lib/game/practice-2048-recovery'
import { PRACTICE_2048_CHECKPOINT_KEY, type Saved2048Practice } from '@/lib/game/2048-practice-checkpoint'
import { PERSONAL_2048_RULES_VERSION } from '@/lib/game/personal-2048-progress'
import { createLocalPracticeGame } from '@/lib/game/local-practice'

const fixture = vi.hoisted(() => ({
  refIndex: 0, stateIndex: 0, refs: [] as { current: unknown }[], states: [] as unknown[],
  layout: null as { deps: readonly unknown[]; cleanup?: () => void } | null,
  frame: { contentWindow: { postMessage: vi.fn() }, src: '' },
  starts: vi.fn(), restores: vi.fn(), destroys: vi.fn(), focus: vi.fn(),
}))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useId: () => 'practice-resume-lifecycle',
  // Daily fetching/fullscreen effects are independent of the WebGL generation lifecycle under test.
  useEffect: () => {},
  useRef: () => {
    const index = fixture.refIndex++
    return fixture.refs[index] ??= { current: index === 0 ? fixture.frame : null }
  },
  useState: (initial: unknown) => {
    const index = fixture.stateIndex++
    if (!(index in fixture.states)) fixture.states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [fixture.states[index], (value: unknown) => {
      fixture.states[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(fixture.states[index]) : value
    }]
  },
  useLayoutEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    if (!fixture.layout || deps.some((value, index) => value !== fixture.layout!.deps[index])) {
      fixture.layout?.cleanup?.()
      fixture.layout = { deps, cleanup: effect() }
    }
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/game/unity-2048-navigation', async () => ({ ...await vi.importActual('@/lib/game/unity-2048-navigation'),
  focusUnity2048: fixture.focus }))
vi.mock('@/lib/game/unity-2048-session', async () => ({ ...await vi.importActual('@/lib/game/unity-2048-session'),
  // Only Session publication/side-effect spies are doubled; Recovery, storage and Free observers are real.
  Unity2048Session: class {
    private saved: Saved2048Practice | null = null
    private stopped = false
    constructor(private publish: (state: unknown) => void) {}
    snapshot = () => ({ mode: 'practice', started: !!this.saved, game_over: false, can_restart: true,
      cells: this.saved?.state.board.flat() ?? Array(16).fill(0), score: this.saved?.state.score ?? 0,
      move_number: this.saved?.state.moveNumber ?? 2, locked: !this.saved, time_left_seconds: -1, message: 'Ready' })
    start = fixture.starts
    canRestorePractice = () => !this.saved && !this.stopped
    restorePractice = (saved: Saved2048Practice) => {
      fixture.restores(saved); this.saved = structuredClone(saved); this.publish(this.snapshot()); return true
    }
    practiceCheckpoint = () => this.saved && !this.stopped
      ? { practiceId: this.saved.practiceId, state: structuredClone(this.saved.state) } : null
    destroy = () => { this.stopped = true; fixture.destroys() }
    tick = vi.fn(); recover = vi.fn(); move = vi.fn(); resynchronizeTime = vi.fn(); beginTrainingDemo = vi.fn(() => false)
  },
}))
import { Unity2048 } from '@/components/game/unity-2048'
import { UNITY_2048_BUILD, UNITY_2048_CHANNEL } from '@/lib/game/unity-2048-session'

const now = Date.parse('2026-10-20T15:00:00Z')
const key = `${PRACTICE_2048_CHECKPOINT_KEY}.synthetic`
let data: Map<string, string>
let storage: Storage
let queuedLocks: (() => void)[]
let heldLocks: Set<string>

function saved(): Saved2048Practice {
  return { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION, category: 'synthetic',
    practiceId: '11111111-1111-4111-8111-111111111111', startedAt: now - 2000, savedAt: now - 1000,
    bestBefore: 512, state: createLocalPracticeGame('host-recovery-natural') }
}
function view() {
  fixture.refIndex = 0; fixture.stateIndex = 0
  return Unity2048({ observationCategory: 'synthetic' })
}
function controller() {
  const value = fixture.refs.find(ref => ref.current instanceof Practice2048Recovery)?.current
  expect(value).toBeInstanceOf(Practice2048Recovery)
  return value as Practice2048Recovery
}
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child)
    ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function click(label: string) {
  const button = nodes(view()).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)
  expect(button, label).toBeDefined(); expect(button!.props.disabled).not.toBe(true)
  return (button!.props.onClick as () => unknown)()
}
function input(type: string) {
  window.dispatchEvent(Object.assign(new Event('message'), { origin: 'http://local.test', source: fixture.frame.contentWindow,
    data: { channel: UNITY_2048_CHANNEL, version: 1, type, build_id: UNITY_2048_BUILD } }))
}
async function flush() { for (let turn = 0; turn < 12; turn++) await Promise.resolve() }
async function dispatchLock() {
  expect(queuedLocks).toHaveLength(1); queuedLocks.shift()!(); await flush()
}
function unmount() { fixture.layout?.cleanup?.(); fixture.layout = null }
function checkpointMutations() {
  return [...vi.mocked(storage.setItem).mock.calls.map(call => call[0]), ...vi.mocked(storage.removeItem).mock.calls.map(call => call[0])]
    .filter(value => value === key)
}

beforeEach(() => {
  fixture.refIndex = 0; fixture.stateIndex = 0; fixture.refs = []; fixture.states = []; fixture.layout = null
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  data = new Map([[key, JSON.stringify(saved())]])
  storage = { getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }) } as unknown as Storage
  queuedLocks = []; heldLocks = new Set()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage,
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }))
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('location', { origin: 'http://local.test' })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in lifecycle test') }))
  vi.stubGlobal('navigator', { locks: { request: vi.fn((name: string, options: { ifAvailable: boolean },
    work: (lock: { name: string } | null) => Promise<void>) => new Promise<void>((resolve, reject) => {
      expect(options.ifAvailable).toBe(true)
      // Delay dispatch, not availability: once dispatched, ifAvailable never waits on an owner.
      queuedLocks.push(() => {
        if (heldLocks.has(name)) { void work(null).then(resolve, reject); return }
        heldLocks.add(name)
        void work({ name }).then(() => { heldLocks.delete(name); resolve() }, error => { heldLocks.delete(name); reject(error) })
      })
    })) } })
})
afterEach(async () => { unmount(); await flush(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each(['start', 'resume'] as const)('cancels UI %s awaiting a WebLock when Unity reports game.error', async action => {
  view(); input('game.ready')
  const old = controller(), raw = data.get(key)
  const pending = click(action === 'start' ? 'Nueva partida' : 'Continuar práctica')
  expect(old.snapshot().pending).toBe(true)
  input('game.error')
  expect(fixture.states[2]).toContain('Unity no pudo cargar')
  await dispatchLock(); await pending
  expect(old.snapshot().pending).toBe(false)
  expect(fixture.starts).not.toHaveBeenCalled(); expect(fixture.restores).not.toHaveBeenCalled()
  expect(data.get(key)).toBe(raw); expect(checkpointMutations()).toEqual([])
  expect(heldLocks.size).toBe(0); expect(await old.resume()).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('destroys recovery on the load timeout and ignores a subsequent real ready message', async () => {
  view()
  const old = controller(), dispose = vi.spyOn(old, 'destroy'), raw = data.get(key)
  await vi.advanceTimersByTimeAsync(90_000)
  expect(fixture.states[2]).toContain('No se pudo cargar Unity')
  expect(dispose).toHaveBeenCalledTimes(1)
  input('game.ready'); await flush()
  expect(fixture.states[1]).toBe(false)
  expect(await old.resume()).toBe(false); expect(await old.start('practice')).toBe(false)
  expect(queuedLocks).toHaveLength(0)
  expect(fixture.starts).not.toHaveBeenCalled(); expect(fixture.restores).not.toHaveBeenCalled()
  expect(data.get(key)).toBe(raw); expect(checkpointMutations()).toEqual([])
})

it('retries through the UI with a new controller and keeps the obsolete pending generation inert', async () => {
  view(); input('game.ready')
  const old = controller(), raw = data.get(key)
  const pending = click('Continuar práctica')
  input('game.error'); click('Reintentar carga'); view()
  const replacement = controller()
  expect(replacement).not.toBe(old)
  expect(fixture.states[1]).toBe(false); expect(fixture.states[2]).toBe('')
  await dispatchLock(); await pending
  input('game.ready'); view()
  expect(replacement.snapshot()).toMatchObject({ status: 'ready', checkpoint: saved(), pending: false })
  expect(await old.resume()).toBe(false); expect(await old.start('practice')).toBe(false)
  expect(fixture.starts).not.toHaveBeenCalled(); expect(fixture.restores).not.toHaveBeenCalled()
  expect(data.get(key)).toBe(raw); expect(checkpointMutations()).toEqual([])
  expect(heldLocks.size).toBe(0)
})

it('cancels pending recovery via actual host unmount and preserves the checkpoint when its delayed lease arrives', async () => {
  view(); input('game.ready')
  const old = controller(), raw = data.get(key), pending = click('Continuar práctica')
  unmount(); await dispatchLock(); await pending
  expect(fixture.refs.find(ref => ref.current === old)).toBeUndefined()
  expect(await old.resume()).toBe(false); expect(await old.start('practice')).toBe(false)
  expect(fixture.starts).not.toHaveBeenCalled(); expect(fixture.restores).not.toHaveBeenCalled()
  expect(data.get(key)).toBe(raw); expect(checkpointMutations()).toEqual([])
  expect(heldLocks.size).toBe(0)
})

it('preserves an owned recovered checkpoint on host unmount and releases its browser lease', async () => {
  view(); input('game.ready')
  const old = controller(), raw = data.get(key), pending = click('Continuar práctica')
  await dispatchLock(); await pending
  expect(fixture.restores).toHaveBeenCalledOnce(); expect(heldLocks.size).toBe(1)
  expect(old.snapshot().checkpoint).toEqual(saved())
  unmount(); await flush()
  expect(heldLocks.size).toBe(0)
  expect(data.get(key)).toBe(raw); expect(checkpointMutations()).toEqual([])
  expect(await old.resume()).toBe(false); expect(await old.start('practice')).toBe(false)
})
