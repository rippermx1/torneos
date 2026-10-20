import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Load2048Diagnostics } from '@/lib/game/2048-load-diagnostics'
import { Free2048Experience } from '@/lib/game/free-2048-experience'
import { Unity2048Session, UNITY_2048_BUILD, UNITY_2048_CHANNEL } from '@/lib/game/unity-2048-session'
import { Load2048DiagnosticsView } from '@/components/game/2048-load-diagnostics'
import { parse2048TrialLocalExport } from '@/lib/analytics/2048-trial-local'

const f = vi.hoisted(() => ({ refIndex: 0, stateIndex: 0, refs: [] as { current: unknown }[], states: [] as unknown[],
  layout: null as { deps: readonly unknown[]; cleanup?: () => void } | null,
  frame: { contentWindow: { postMessage: vi.fn() }, src: '' } }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useId: () => 'load-diagnostics-host', useEffect: () => {},
  useRef: () => { const i = f.refIndex++; return f.refs[i] ??= { current: i === 0 ? f.frame : null } },
  useState: (initial: unknown) => {
    const i = f.stateIndex++
    if (!(i in f.states)) f.states[i] = initial
    return [f.states[i], (value: unknown) => { f.states[i] = typeof value === 'function' ? (value as (p: unknown) => unknown)(f.states[i]) : value }]
  },
  useLayoutEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    if (!f.layout || deps.some((value, i) => value !== f.layout!.deps[i])) {
      f.layout?.cleanup?.(); f.layout = { deps, cleanup: effect() }
    }
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/game/unity-2048-navigation', async () => ({ ...await vi.importActual('@/lib/game/unity-2048-navigation'), focusUnity2048: vi.fn() }))
import { Unity2048 } from '@/components/game/unity-2048'

let bytes: Map<string, string>, exports: Blob[], serial: number, elapsed: number
function view(tournament = false) {
  f.refIndex = 0; f.stateIndex = 0
  return Unity2048({ observationCategory: 'synthetic', ...(tournament ? { tournament: { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' } } : {}) })
}
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function text(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child) ? text(child.props.children as ReactNode) : String(child)).join('')
}
function click(label: string) {
  const tree = view(), diagnostic = nodes(tree).find(n => n.type === Load2048DiagnosticsView)
  const all = [...nodes(tree), ...(diagnostic ? nodes(Load2048DiagnosticsView(diagnostic.props as Parameters<typeof Load2048DiagnosticsView>[0])) : [])]
  const button = all.find(n => n.type === 'button' && text(n.props.children as ReactNode) === label)
  expect(button, label).toBeDefined(); expect(button!.props.disabled).not.toBe(true)
  return (button!.props.onClick as () => unknown)()
}
function controller<T>(type: new (...args: never[]) => T): T {
  const found = f.refs.find(ref => ref.current instanceof type)?.current
  expect(found).toBeInstanceOf(type); return found as T
}
function input(type: string, extra = {}, origin = 'http://local.test', source = f.frame.contentWindow) {
  window.dispatchEvent(Object.assign(new Event('message'), { origin, source,
    data: { channel: UNITY_2048_CHANNEL, version: 1, type, build_id: UNITY_2048_BUILD, ...extra } }))
}
async function exported() {
  click('Descargar diagnóstico de carga'); expect(exports.length).toBeGreaterThan(0)
  return JSON.parse(await exports.at(-1)!.text())
}
function unmount() { f.layout?.cleanup?.(); f.layout = null }
beforeEach(() => {
  f.refs = []; f.states = []; f.layout = null; f.refIndex = 0; f.stateIndex = 0
  bytes = new Map(); exports = []; serial = 0; elapsed = 0
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-10-20T16:00:00Z'))
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  vi.stubGlobal('crypto', { randomUUID: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}` })
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (k: string) => bytes.get(k) ?? null, setItem: (k: string, v: string) => { bytes.set(k, v) }, removeItem: (k: string) => bytes.delete(k),
  }, matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }))
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible', createElement: () => ({ click: vi.fn() }) }))
  vi.stubGlobal('location', { origin: 'http://local.test' }); vi.stubGlobal('navigator', {})
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('URL', { createObjectURL: (data: Blob) => { exports.push(data); return 'blob:local-test' }, revokeObjectURL: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in local diagnostic tests') }))
})
afterEach(() => { unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('exports a valid diagnostic before ready with no invented practice or return', async () => {
  view()
  const out = await exported(), metrics = parse2048TrialLocalExport(JSON.stringify(out))
  expect(out.loadDiagnostics.entries).toHaveLength(1)
  expect(out.loadDiagnostics.entries[0].result).toBe('loading')
  expect(out.observations.ledger).toBeNull(); expect(out.localReturn.daysPlayed).toEqual([])
  expect(metrics.loadDiagnostics).toBeDefined(); expect(fetch).not.toHaveBeenCalled()
})
it('exports one error before ready and ignores duplicates, raw messages and late ready', async () => {
  view(); input('game.error', { message: 'https://secret.invalid/token contact@example.com' }); input('game.error'); input('game.ready')
  const out = await exported()
  expect(out.loadDiagnostics.entries.map((e: { result: string }) => e.result)).toEqual(['error'])
  expect(JSON.stringify(out)).not.toMatch(/secret.invalid|contact@example/)
  expect(out.observations.ledger).toBeNull(); expect(out.localReturn.daysPlayed).toEqual([])
  await vi.advanceTimersByTimeAsync(90_001)
  expect(controller(Load2048Diagnostics).snapshot().entries[0].result).toBe('error')
  expect(fetch).not.toHaveBeenCalled()
})
it('records timeout once and keeps export enabled without starting a game', async () => {
  view(); elapsed = 90_000; await vi.advanceTimersByTimeAsync(90_000); input('game.ready'); input('game.error')
  const out = await exported()
  expect(out.loadDiagnostics.entries).toHaveLength(1); expect(out.loadDiagnostics.entries[0].result).toBe('timeout')
  expect(out.observations.ledger).toBeNull(); expect(fetch).not.toHaveBeenCalled()
})
it('creates one linked retry attempt and preserves the failed outcome without gameplay', async () => {
  view(); input('game.error'); const first = controller(Load2048Diagnostics).currentId()
  click('Reintentar carga'); view(); elapsed = 600; input('game.ready'); input('game.ready')
  const out = await exported()
  expect(out.loadDiagnostics.entries).toHaveLength(2)
  expect(out.loadDiagnostics.entries.find((e: { id: string }) => e.id === first).result).toBe('error')
  expect(out.loadDiagnostics.entries.find((e: { id: string }) => e.id !== first)).toMatchObject({ result: 'ready', retryOf: first })
  expect(out.observations.ledger.practices).toEqual([])
  expect(out.observations.ledger.events.filter((e: { kind: string }) => e.kind === 'ready')).toHaveLength(1)
  expect(out.localReturn.daysPlayed).toEqual([]); expect(fetch).not.toHaveBeenCalled()
})
it('rejects messages from another origin, window or build', () => {
  view(); input('game.error', {}, 'https://other.invalid'); input('game.error', {}, 'http://local.test', {} as typeof f.frame.contentWindow)
  input('game.ready', { build_id: 'different-build' })
  expect(controller(Load2048Diagnostics).snapshot().entries[0].result).toBe('loading')
})
it('closes a loading attempt as inconclusive on pagehide without inferring abandonment', () => {
  view(); window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide'))
  expect(controller(Load2048Diagnostics).snapshot().entries.map(e => e.result)).toEqual(['inconclusive'])
  expect(controller(Free2048Experience).snapshot().retention.daysPlayed).toEqual([])
})
it('reuses the original game milestones instead of generating events on diagnostic export', async () => {
  view(); elapsed = 200; input('game.ready'); await click('Iniciar partida')
  const game = controller(Unity2048Session)
  for (let i = 0; i < 40 && game.snapshot().move_number < 22 && !game.snapshot().game_over; i++) {
    elapsed += 500; vi.setSystemTime(Date.now() + 500)
    await game.move((['left', 'down', 'right', 'up'] as const)[i % 4])
  }
  const first = await exported(), second = await exported()
  expect(first.observations.ledger.practices).toHaveLength(1)
  expect(first.observations.ledger.events.filter((e: { kind: string }) => e.kind === 'start')).toHaveLength(1)
  expect(first.observations.ledger.events.filter((e: { kind: string }) => e.kind === 'first-valid-move')).toHaveLength(1)
  expect(first.observations.ledger.events.filter((e: { kind: string }) => e.kind === '20-valid-moves')).toHaveLength(1)
  expect(second.observations.ledger.events).toEqual(first.observations.ledger.events)
  expect(second.loadDiagnostics.entries).toEqual(first.loadDiagnostics.entries)
  expect(second.localReturn.daysPlayed).toEqual(first.localReturn.daysPlayed)
  expect(fetch).not.toHaveBeenCalled()
})
it('does not attach the diagnostic or persist attempts for tournament mode', () => {
  const tree = view(true)
  expect(nodes(tree).some(n => n.type === Load2048DiagnosticsView)).toBe(false)
  expect([...bytes.keys()].some(k => k.includes('load-diagnostics'))).toBe(false)
})
