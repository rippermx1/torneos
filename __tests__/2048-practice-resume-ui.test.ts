import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Unity2048State } from '@/lib/game/unity-2048-session'
import type { Free2048Snapshot } from '@/lib/game/free-2048-experience'
import type { Practice2048RecoverySnapshot } from '@/lib/game/practice-2048-recovery'
import { createLocalPracticeGame } from '@/lib/game/local-practice'
import { PERSONAL_2048_RULES_VERSION } from '@/lib/game/personal-2048-progress'
import { getDaily2048Challenge } from '@/lib/game/daily-2048'
import { Free2048Experience } from '@/lib/game/free-2048-experience'

const fixture = vi.hoisted(() => ({ stateIndex: 0, refIndex: 0, states: {} as Record<number, unknown>, refs: [] as { current: unknown }[],
  focus: vi.fn(), start: vi.fn(), observe: vi.fn(), recordAccount: vi.fn(), selectNext: vi.fn(),
  resume: vi.fn(), recoveryStart: vi.fn(), recoverySnapshot: vi.fn(), invalidate: vi.fn(), order: [] as string[] }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useId: () => 'practice-resume-ui', useEffect: () => {}, useLayoutEffect: () => {},
  useRef: () => fixture.refs[fixture.refIndex++] ?? { current: null },
  useState: (initial: unknown) => {
    const index = fixture.stateIndex++
    return [index in fixture.states ? fixture.states[index] : typeof initial === 'function' ? (initial as () => unknown)() : initial,
      (value: unknown) => { fixture.states[index] = value }]
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/game/unity-2048-navigation', async () => ({ ...await vi.importActual('@/lib/game/unity-2048-navigation'), focusUnity2048: fixture.focus }))

import { Unity2048 } from '@/components/game/unity-2048'

const challenge = getDaily2048Challenge(Date.parse('2026-10-20T15:00:00Z'))
const tournament = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout', leaderboardUrl: '/ranking' }
const state = (patch: Partial<Unity2048State> = {}): Unity2048State => ({
  cells: Array(16).fill(0), score: 0, move_number: 2, game_over: false, locked: true, can_restart: true,
  mode: 'practice', message: 'Pulsa Iniciar partida cuando estés listo.', time_left_seconds: -1, started: false, ...patch,
})
function recovery(patch: Partial<Practice2048RecoverySnapshot> = {}): Practice2048RecoverySnapshot {
  return { status: 'ready', pending: false, checkpoint: { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION,
    category: 'observed_browser', practiceId: '00000000-0000-4000-8000-000000000001', startedAt: 1000,
    savedAt: 2000, bestBefore: 200, state: createLocalPracticeGame('practice:local:resume-ui') }, ...patch }
}
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child) ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function button(tree: ReactNode, label: string) {
  return nodes(tree).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)
}
function view(props: Parameters<typeof Unity2048>[0] = {}) {
  fixture.refIndex = 0; fixture.stateIndex = 0
  return Unity2048(props)
}
function click(tree: ReactNode, label: string) {
  const control = button(tree, label)
  expect(control, label).toBeDefined(); expect(control!.props.disabled).not.toBe(true)
  ;(control!.props.onClick as () => void)()
}
async function flush() { for (let index = 0; index < 5; index++) await Promise.resolve() }
const free = () => fixture.states[7] as Free2048Snapshot

beforeEach(() => {
  vi.clearAllMocks(); fixture.order = []
  const snapshot = new Free2048Experience({ getStorage: () => null, category: 'observed_browser', now: () => challenge.serverNow }).snapshot()
  fixture.states = { 1: true, 2: '', 4: state(), 7: { ...snapshot, dailyTimeConfirmed: true }, 8: challenge, 12: null, 13: recovery() }
  fixture.refs = Array.from({ length: 9 }, () => ({ current: null as unknown }))
  fixture.refs[2].current = { start: fixture.start, snapshot: () => fixture.states[4] }
  fixture.refs[5].current = { selectNext: fixture.selectNext, observe: fixture.observe, recordAccount: fixture.recordAccount }
  fixture.refs[7].current = { invalidate: fixture.invalidate }
  fixture.refs[8].current = { resume: fixture.resume, start: fixture.recoveryStart, snapshot: fixture.recoverySnapshot }
  fixture.recoverySnapshot.mockImplementation(() => fixture.states[13])
  fixture.resume.mockImplementation(async () => { fixture.order.push('resume'); return true })
  fixture.recoveryStart.mockResolvedValue(true); fixture.selectNext.mockReturnValue(true)
  fixture.invalidate.mockImplementation(() => { fixture.order.push('invalidate') })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
})
afterEach(() => { vi.unstubAllGlobals() })

it('offers an explicit continuation before starting when a valid private checkpoint is available', () => {
  const tree = view()
  expect(button(tree, 'Continuar práctica')?.props.disabled).toBe(false)
  expect(button(tree, 'Nueva partida')).toBeDefined()
  expect(button(tree, 'Iniciar partida')).toBeUndefined()
  expect(renderToStaticMarkup(tree)).toContain('Tienes una práctica guardada en este navegador')
  expect(fixture.resume).not.toHaveBeenCalled(); expect(fixture.start).not.toHaveBeenCalled()
})

it.each(['invalid', 'unavailable', 'conflict', 'unsupported', 'busy', 'stale'] as const)('does not offer an unavailable or unsafe recovery: %s', status => {
  fixture.states[13] = recovery({ status })
  expect(button(view(), 'Continuar práctica')).toBeUndefined()
})

it('keeps a new ordinary practice available without a saved game or recovery controller', async () => {
  fixture.states[13] = recovery({ checkpoint: null }); fixture.refs[8].current = null
  const tree = view()
  expect(button(tree, 'Continuar práctica')).toBeUndefined()
  click(tree, 'Iniciar partida'); await flush()
  expect(fixture.selectNext).toHaveBeenCalledExactlyOnceWith('practice', challenge)
  expect(fixture.start).toHaveBeenCalledExactlyOnceWith(undefined, { freeMode: 'practice' })
  expect(fixture.resume).not.toHaveBeenCalled()
})

it.each([
  ['active practice', state({ started: true, locked: false })],
  ['completed practice', state({ started: true, game_over: true, locked: true })],
  ['assisted continuation', state({ started: true, locked: false, training: { phase: 'active', sourceId: 'source', continuationId: 'continuation',
    originalScore: 100, originalHighestTile: 32, originalMoves: 10, originalDirection: 'left', alternativeDirections: ['up'], awaitingAlternative: false, demonstration: true } })],
])('does not offer another continuation during an already started %s', (_label, value) => {
  fixture.states[4] = value
  expect(button(view(), 'Continuar práctica')).toBeUndefined()
})

it('keeps ordinary recovery outside tournament play and the running daily challenge', () => {
  expect(button(view({ tournament }), 'Continuar práctica')).toBeUndefined()
  fixture.states[4] = state({ started: true, locked: false }); fixture.states[7] = { ...free(), mode: 'daily', challenge }
  expect(button(view(), 'Continuar práctica')).toBeUndefined()
  expect(fixture.resume).not.toHaveBeenCalled()
})

it.each([
  ['daily mode before a stale game snapshot arrives', 'daily', { started: false }],
  ['competitive wire state', 'practice', { started: false, mode: 'tournament' }],
  ['terminal stale state', 'practice', { started: false, game_over: true }],
  ['training stale state', 'practice', { started: false, training: { phase: 'offered', sourceId: 'source', continuationId: null,
    originalScore: 100, originalHighestTile: 32, originalMoves: 10, originalDirection: 'left', alternativeDirections: ['up'], awaitingAlternative: false, demonstration: true } }],
] as const)('does not expose continuation for %s', (_label, mode, patch) => {
  fixture.states[4] = state(patch as Partial<Unity2048State>); fixture.states[7] = { ...free(), mode }
  expect(button(view(), 'Continuar práctica')).toBeUndefined()
})

it('disables continuation, new practice and daily selection while recovery is pending', () => {
  fixture.states[13] = recovery({ pending: true })
  const tree = view()
  for (const label of ['Continuar práctica', 'Nueva partida', 'Jugar desafío de hoy']) expect(button(tree, label)?.props.disabled).toBe(true)
  expect(renderToStaticMarkup(tree)).toContain('Preparando práctica')
})

it.each(['loading', 'failure'] as const)('disables continuation until Unity can accept the state: %s', condition => {
  if (condition === 'loading') fixture.states[1] = false
  else fixture.states[2] = 'Unity no pudo cargar'
  expect(button(view(), 'Continuar práctica')?.props.disabled).toBe(true)
})

it('invalidates any old reward request before resuming and focuses only after a successful restoration', async () => {
  let resolve!: (value: boolean) => void
  fixture.resume.mockImplementation(() => { fixture.order.push('resume'); return new Promise<boolean>(done => { resolve = done }) })
  const fetch = vi.fn(), storage = { getItem: vi.fn(), setItem: vi.fn() }
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('localStorage', storage)
  click(view(), 'Continuar práctica')
  expect(fixture.order).toEqual(['invalidate', 'resume'])
  expect(fixture.focus).not.toHaveBeenCalled()
  resolve(true); await flush()
  expect(fixture.focus).toHaveBeenCalledTimes(1)
  expect(fixture.start).not.toHaveBeenCalled(); expect(fixture.recoveryStart).not.toHaveBeenCalled()
  expect(fixture.observe).not.toHaveBeenCalled(); expect(fixture.recordAccount).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
})

it('does not start a different game or move focus when restoration is refused', async () => {
  fixture.resume.mockResolvedValue(false)
  click(view(), 'Continuar práctica'); await flush()
  expect(fixture.resume).toHaveBeenCalledTimes(1); expect(fixture.invalidate).toHaveBeenCalledTimes(1)
  expect(fixture.focus).not.toHaveBeenCalled(); expect(fixture.start).not.toHaveBeenCalled()
  expect(fixture.observe).not.toHaveBeenCalled(); expect(fixture.recordAccount).not.toHaveBeenCalled()
})

it('rechecks pending state at click time rather than trusting an older enabled control', async () => {
  const tree = view()
  fixture.states[13] = recovery({ pending: true })
  click(tree, 'Continuar práctica'); click(tree, 'Nueva partida'); await flush()
  expect(fixture.resume).not.toHaveBeenCalled(); expect(fixture.recoveryStart).not.toHaveBeenCalled()
  expect(fixture.start).not.toHaveBeenCalled(); expect(fixture.invalidate).not.toHaveBeenCalled()
  expect(fixture.focus).not.toHaveBeenCalled()
})

it('routes a new ordinary practice through recovery ownership and never directly starts the session', async () => {
  click(view(), 'Nueva partida'); await flush()
  expect(fixture.order[0]).toBe('invalidate')
  expect(fixture.selectNext).toHaveBeenCalledExactlyOnceWith('practice', challenge)
  expect(fixture.recoveryStart).toHaveBeenCalledExactlyOnceWith('practice', undefined)
  expect(fixture.start).not.toHaveBeenCalled(); expect(fixture.resume).not.toHaveBeenCalled()
  expect(fixture.focus).toHaveBeenCalledTimes(1)
})

it.each([
  ['busy', 'otra pestaña'], ['stale', 'ya no se puede continuar'], ['invalid', 'Puedes seguir jugando sin guardado'],
] as const)('explains %s recovery without turning it into a block on ordinary play', (status, message) => {
  fixture.states[13] = recovery({ status })
  const tree = view()
  expect(renderToStaticMarkup(tree)).toContain(message)
  expect(button(tree, 'Nueva partida')?.props.disabled).toBeFalsy()
  expect(button(tree, 'Jugar desafío de hoy')?.props.disabled).toBeFalsy()
})
