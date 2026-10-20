import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, createElement, isValidElement, type ReactElement, type ReactNode, type RefObject } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RewardedController, type RewardedSnapshot } from '@/lib/ads/rewarded'
import { Unity2048Session, type Unity2048State } from '@/lib/game/unity-2048-session'
import { Free2048Experience } from '@/lib/game/free-2048-experience'
import { getDaily2048Challenge } from '@/lib/game/daily-2048'

const fixture = vi.hoisted(() => ({ host: false, stateIndex: 0, refIndex: 0,
  game: null as unknown, free: null as unknown, rewarded: null as unknown,
  session: null as unknown, experience: null as unknown, controller: null as unknown,
  challenge: null as unknown, focus: vi.fn(), captureEffects: false,
  effects: [] as (() => void)[], persistentRefs: null as { current: unknown }[] | null }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useId: () => 'rewarded-ui', useEffect: (effect: () => void) => { if (fixture.captureEffects) fixture.effects.push(effect) }, useLayoutEffect: () => {},
  useRef: () => {
    const index = fixture.refIndex++
    if (fixture.persistentRefs) return fixture.persistentRefs[index] ??= { current: null }
    const refs: Record<number, unknown> = { 2: fixture.session, 5: fixture.experience, 7: fixture.controller }
    return { current: fixture.host ? refs[index] ?? null : null }
  },
  useState: (initial: unknown) => {
    const index = fixture.stateIndex++
    const values: Record<number, unknown> = { 1: true, 4: fixture.game, 7: fixture.free, 8: fixture.challenge, 12: fixture.rewarded }
    return [fixture.host && index in values ? values[index] : initial, vi.fn()]
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/game/unity-2048-navigation', async () => ({ ...await vi.importActual('@/lib/game/unity-2048-navigation'), focusUnity2048: fixture.focus }))
import { Rewarded2048Demo } from '@/components/game/2048-rewarded-demo'
import { Game2048Result } from '@/components/game/2048-game-result'
import { Unity2048 } from '@/components/game/unity-2048'

const now = Date.parse('2026-10-19T12:00:00Z')
const sourceId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const offerLabel = 'Probar otra jugada · demostración'
const snapshot = (overrides: Partial<RewardedSnapshot> = {}): RewardedSnapshot => ({
  mode: 'demo', status: 'pending', sourceId, requestId, available: false, reason: null,
  usedToday: 0, reservedToday: 0, remainingToday: 2, quotaStatus: 'ready', ...overrides,
})
const offered = (): Unity2048State => ({ cells: Array(16).fill(2), score: 1024, move_number: 92,
  game_over: true, locked: true, can_restart: true, mode: 'practice', message: 'Práctica terminada', started: true, time_left_seconds: -1,
  training: { phase: 'offered', sourceId, continuationId: null, originalScore: 1024, originalHighestTile: 128,
    originalMoves: 90, originalDirection: 'up', alternativeDirections: ['left'], awaitingAlternative: false, demonstration: true } })
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child)
    ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function button(tree: ReactNode, label: string) {
  const node = nodes(tree).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)
  expect(node, label).toBeDefined(); return node!
}
function resultTree(overrides: Partial<Parameters<typeof Game2048Result>[0]> = {}) {
  return Game2048Result({ state: offered(), freeMode: 'practice', onRestart: vi.fn(), onBeginTraining: vi.fn(),
    rewarded: snapshot(), onContinueRewarded: vi.fn(), onCancelRewarded: vi.fn(), ...overrides })
}
function hostPanel() {
  fixture.host = true; fixture.stateIndex = 0; fixture.refIndex = 0
  const host = Unity2048({ observationCategory: 'synthetic' })
  const node = nodes(host).find(node => node.type === Game2048Result)!
  expect(node).toBeDefined()
  return { host, props: node.props as Parameters<typeof Game2048Result>[0] }
}
function demoFrom(props: Parameters<typeof Game2048Result>[0]) {
  const node = nodes(Game2048Result(props)).find(node => node.type === Rewarded2048Demo)!
  expect(node).toBeDefined()
  return node.props as Parameters<typeof Rewarded2048Demo>[0]
}
async function flush() { for (let index = 0; index < 5; index++) await Promise.resolve() }
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size } }
}
async function naturalPractice() {
  const storage = memoryStorage(), challenge = getDaily2048Challenge(now)
  const experience = new Free2048Experience({ getStorage: () => storage, category: 'synthetic',
    now: () => now, dailyAvailable: () => true, changed: free => { fixture.free = free } })
  fixture.experience = experience; fixture.challenge = challenge; fixture.free = experience.snapshot()
  const session = new Unity2048Session(game => { fixture.game = game }, vi.fn(), undefined, undefined, experience.observe)
  fixture.session = session
  await session.start('training-demo-0')
  const cycle = ['left', 'up', 'right', 'down'] as const
  for (let input = 0; input < 4000 && !session.snapshot().game_over; input++) await session.move(cycle[input % cycle.length])
  expect(session.snapshot().training?.phase).toBe('offered')
  const controller = new RewardedController({ mode: 'demo', category: 'synthetic', getStorage: () => storage,
    now: () => now, runExclusive: async work => work(),
    isEligible: source => session.snapshot().training?.phase === 'offered' && session.snapshot().training?.sourceId === source,
    grant: source => session.beginTrainingDemo(source), observe: experience.observeRewarded,
    changed: value => { fixture.rewarded = value } })
  fixture.controller = controller
  fixture.rewarded = controller.snapshot(session.snapshot().training!.sourceId)
  return { experience, session, controller }
}

beforeEach(() => {
  fixture.host = false; fixture.stateIndex = 0; fixture.refIndex = 0
  fixture.game = null; fixture.free = null; fixture.rewarded = null
  fixture.session = null; fixture.experience = null; fixture.controller = null; fixture.challenge = null
  fixture.captureEffects = false; fixture.effects = []; fixture.persistentRefs = null
  fixture.focus.mockClear(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
})
afterEach(() => { (fixture.controller as RewardedController | null)?.destroy(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('asks for an explicit demo decision without imitating an advertisement or a countdown', () => {
  const value = renderToStaticMarkup(createElement(Rewarded2048Demo, { snapshot: snapshot(), onContinue: vi.fn(), onCancel: vi.fn() }))
  expect(value).toContain('Demostración de entrenamiento')
  expect(value).toContain('Aquí no se mostrará ningún anuncio')
  expect(value).toContain('Continuar entrenamiento</button>')
  expect(value).toContain('Cancelar</button>')
  expect(value).toContain('una continuación por práctica y dos al día de Chile')
  expect(value).toContain('Continuaciones utilizadas hoy: 0 de 2 · disponibles: 2')
  expect(value).not.toContain('role="timer"')
  expect(value).not.toContain('Ver anuncio')
})

it('captures each pending request identity for continue and cancel', () => {
  const onContinue = vi.fn(), onCancel = vi.fn(), value = snapshot()
  const tree = Rewarded2048Demo({ snapshot: value, onContinue, onCancel })
  value.requestId = 'later-request'
  ;(button(tree, 'Continuar entrenamiento').props.onClick as () => void)()
  ;(button(tree, 'Cancelar').props.onClick as () => void)()
  expect(onContinue).toHaveBeenCalledExactlyOnceWith(requestId)
  expect(onCancel).toHaveBeenCalledExactlyOnceWith(requestId)
})

it.each(['off', 'provider'] as const)('never exposes a demo confirmation in %s mode', mode => {
  const value = renderToStaticMarkup(createElement(Rewarded2048Demo, { snapshot: snapshot({ mode }), onContinue: vi.fn(), onCancel: vi.fn() }))
  expect(value).not.toContain('Continuar entrenamiento</button>')
  expect(value).not.toContain('Cancelar</button>')
})

it.each([
  ['storage_unavailable', 'No pudimos acceder al almacenamiento', false],
  ['storage_corrupt', 'No podemos confirmar el registro', false],
  ['storage_uncertain', 'No podemos confirmar el registro', false],
  ['locks_unavailable', 'no permite coordinar el límite entre pestañas', false],
  ['clock_rollback', 'No pudimos confirmar la fecha', false],
  ['cancelled', 'no se consumió una continuación', true],
  ['no_fill', 'No se consumió una continuación', true],
  ['timeout', 'La solicitud venció', true],
] as const)('explains %s without blocking ordinary play', (reason, message, available) => {
  const tree = resultTree({ rewarded: snapshot({ status: 'unavailable', reason, requestId: null, available }) })
  const value = renderToStaticMarkup(tree)
  expect(value).toContain(message)
  expect(button(tree, 'Nueva partida').props.disabled).toBe(false)
  expect(button(tree, offerLabel).props.disabled).toBe(!available)
  expect(value).not.toContain('Continuar entrenamiento</button>')
})

it('shows an exhausted quota and disables only the optional offer', () => {
  const tree = resultTree({ rewarded: snapshot({ status: 'unavailable', reason: 'daily_cap', requestId: null, usedToday: 2, remainingToday: 0 }) })
  const value = renderToStaticMarkup(tree)
  expect(value).toContain('Alcanzaste las dos continuaciones')
  expect(button(tree, offerLabel).props.disabled).toBe(true)
  expect(button(tree, 'Nueva partida').props.disabled).toBe(false)
})

it('clears the old exhausted-day message when the next Chile day has available continuations', () => {
  const tree = resultTree({ rewarded: snapshot({ status: 'unavailable', reason: 'daily_cap', requestId: null,
    usedToday: 0, remainingToday: 2, available: true }) })
  expect(renderToStaticMarkup(tree)).not.toContain('Alcanzaste las dos continuaciones')
  expect(button(tree, offerLabel).props.disabled).toBe(false)
})

it('keeps a pending request from another original practice out of this result', () => {
  const value = renderToStaticMarkup(resultTree({ rewarded: snapshot({ sourceId: 'different-practice' }) }))
  expect(value).not.toContain('Continuar entrenamiento</button>')
})

it.each(['daily', 'tournament'] as const)('does not expose the adapter panel in %s', mode => {
  const tree = resultTree(mode === 'daily' ? { freeMode: 'daily', dailyChallenge: getDaily2048Challenge(now) }
    : { tournament: { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' } })
  expect(renderToStaticMarkup(tree)).not.toContain('Demostración de entrenamiento')
})

it('returns focus to the original offer after cancelling its exact pending request', () => {
  const onCancelRewarded = vi.fn(), focus = vi.fn()
  const tree = resultTree({ onCancelRewarded })
  const offer = button(tree, offerLabel)
  ;(offer.props.ref as RefObject<HTMLButtonElement | null>).current = { focus } as unknown as HTMLButtonElement
  const panel = nodes(tree).find(node => node.type === Rewarded2048Demo)!
  ;(panel.props.onCancel as (id: string) => void)(requestId)
  expect(onCancelRewarded).toHaveBeenCalledExactlyOnceWith(requestId)
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
})

it.each(['timeout', 'error'] as const)('returns focus when a %s removes the pending panel without consuming the offer', status => {
  fixture.captureEffects = true; fixture.persistentRefs = []
  const focus = vi.fn()
  const pending = resultTree()
  ;(button(pending, offerLabel).props.ref as RefObject<HTMLButtonElement | null>).current = { focus } as unknown as HTMLButtonElement
  fixture.effects.forEach(effect => effect())
  fixture.refIndex = 0; fixture.effects = []
  const ended = resultTree({ rewarded: snapshot({ status, reason: status === 'timeout' ? 'timeout' : 'provider_error', available: true }) })
  fixture.effects.forEach(effect => effect())
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  expect(button(ended, offerLabel).props.disabled).toBe(false)
})

it('connects cancellation, retry and explicit continuation to the real adapter and existing game', async () => {
  const { experience, session, controller } = await naturalPractice()
  const before = experience.snapshot(), original = session.snapshot()
  const first = hostPanel().props
  first.onBeginTraining!(original.training!.sourceId); await flush()
  expect(session.snapshot().training?.phase).toBe('offered')
  let demo = demoFrom(hostPanel().props)
  demo.onCancel(demo.snapshot.requestId!)
  expect(controller.snapshot().usedToday).toBe(0)
  expect(session.snapshot()).toEqual(original)
  expect(experience.snapshot()).toEqual(before)

  hostPanel().props.onBeginTraining!(original.training!.sourceId); await flush()
  demo = demoFrom(hostPanel().props)
  const tree = Rewarded2048Demo(demo)
  ;(button(tree, 'Continuar entrenamiento').props.onClick as () => void)(); await flush()
  expect(session.snapshot().training?.phase).toBe('active')
  expect(controller.snapshot().usedToday).toBe(1)
  expect(experience.snapshot()).toEqual(before)
  expect(fixture.focus).toHaveBeenCalledTimes(1)
})

it.each(['practice', 'daily'] as const)('invalidates the old request before switching to a new %s game', async mode => {
  const { session, controller, experience } = await naturalPractice()
  hostPanel().props.onBeginTraining!(session.snapshot().training!.sourceId); await flush()
  const oldPanel = demoFrom(hostPanel().props)
  const { host, props } = hostPanel()
  if (mode === 'practice') props.onRestart()
  else (button(host, 'Jugar desafío de hoy').props.onClick as () => void)()
  await flush()
  const newGame = session.snapshot(), focusCount = fixture.focus.mock.calls.length
  oldPanel.onContinue(oldPanel.snapshot.requestId!); await flush()
  expect(session.snapshot()).toEqual(newGame)
  expect(newGame.game_over).toBe(false)
  expect(newGame.training).toBeUndefined()
  expect(experience.snapshot().mode).toBe(mode)
  expect(controller.snapshot().usedToday).toBe(0)
  expect(fixture.focus).toHaveBeenCalledTimes(focusCount)
})
