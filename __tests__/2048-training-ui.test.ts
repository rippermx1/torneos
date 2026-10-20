import { beforeEach, expect, it, vi } from 'vitest'
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Unity2048State } from '@/lib/game/unity-2048-session'
import type { Training2048State } from '@/lib/game/2048-training'
import { Free2048Experience, type Free2048Snapshot } from '@/lib/game/free-2048-experience'
import { getDaily2048Challenge } from '@/lib/game/daily-2048'

const fixture = vi.hoisted(() => ({ host: false, stateIndex: 0, refIndex: 0,
  state: null as unknown, personal: null as unknown, free: null as unknown, challenge: null as unknown,
  session: null as unknown, experience: null as unknown, controller: null as unknown, focus: vi.fn(), notice: vi.fn() }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useId: () => 'training-ui', useEffect: () => {}, useLayoutEffect: () => {},
  useRef: () => {
    const index = fixture.refIndex++
    return { current: fixture.host ? index === 2 ? fixture.session : index === 5 ? fixture.experience : index === 7 ? fixture.controller : null : null }
  },
  useState: (initial: unknown) => {
    const index = fixture.stateIndex++
    const values: Record<number, unknown> = { 1: true, 4: fixture.state, 6: fixture.personal, 7: fixture.free, 8: fixture.challenge }
    return [fixture.host && index in values ? values[index] : initial, index === 11 ? fixture.notice : vi.fn()]
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/game/unity-2048-navigation', async () => ({ ...await vi.importActual('@/lib/game/unity-2048-navigation'),
  focusUnity2048: fixture.focus,
}))

import { Game2048Result, Training2048View } from '@/components/game/2048-game-result'
import { Unity2048 } from '@/components/game/unity-2048'

const offerLabel = 'Probar otra jugada · demostración'
const challenge = getDaily2048Challenge(Date.parse('2026-10-16T12:00:00Z'))
const tournament = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout', leaderboardUrl: '/ranking' }
const training = (overrides: Partial<Training2048State> = {}): Training2048State => ({
  phase: 'offered', sourceId: 'original-practice', continuationId: null,
  originalScore: 1024, originalHighestTile: 128, originalMoves: 90, originalDirection: 'left',
  alternativeDirections: ['up', 'down'], awaitingAlternative: false, demonstration: true, ...overrides,
})
const state = (overrides: Partial<Unity2048State> = {}): Unity2048State => ({
  cells: Array(16).fill(2), score: 1024, move_number: 92, game_over: true, locked: true,
  can_restart: true, mode: 'practice', message: 'Práctica terminada', started: true,
  time_left_seconds: 0, training: training(), ...overrides,
})
function freeSnapshot(): Free2048Snapshot {
  const value = new Free2048Experience({ getStorage: () => null, category: 'synthetic',
    now: () => challenge.serverNow }).snapshot()
  return { ...value, personal: { ...value.personal, bestScore: 2048, bestTile: 256, bestBefore: 2048, storageStatus: 'ready' } }
}
function result(props: Partial<Parameters<typeof Game2048Result>[0]> = {}) {
  return renderToStaticMarkup(createElement(Game2048Result, {
    state: state(), freeMode: 'practice', onRestart: vi.fn(), onBeginTraining: vi.fn(), ...props,
  }))
}
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child)
    ? textOf(child.props.children as ReactNode) : String(child)).join('')
}
function button(tree: ReactNode, label: string) {
  const value = nodes(tree).find(node => node.type === 'button' && textOf(node.props.children as ReactNode) === label)
  expect(value, `button ${label}`).toBeDefined()
  return value!
}
function host() {
  fixture.host = true; fixture.stateIndex = 0; fixture.refIndex = 0
  return Unity2048({})
}

beforeEach(() => {
  fixture.host = false; fixture.stateIndex = 0; fixture.refIndex = 0
  fixture.state = state(); fixture.free = freeSnapshot(); fixture.personal = (fixture.free as Free2048Snapshot).personal
  fixture.challenge = challenge; fixture.session = null; fixture.experience = null; fixture.controller = null
  fixture.focus.mockClear(); fixture.notice.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
})

it('offers one clearly labelled demonstration after an ordinary practice while retaining its result and mark', () => {
  const value = result({ personal: freeSnapshot().personal })
  expect(value).toContain('Práctica terminada</h2>')
  expect(value).toContain('Puntaje final: 1.024')
  expect(value).toContain('Tu marca personal')
  expect(value).toContain(offerLabel)
  expect(value).toContain('Demostración sin anuncio real')
  expect(value).toContain('vuelve una vez al estado previo a tu último movimiento válido')
  expect(value).not.toContain('Ver anuncio')
})

it.each([
  ['daily wire practice', { freeMode: 'daily' as const }],
  ['daily definition', { dailyChallenge: challenge }],
  ['tournament', { tournament }],
  ['competitive wire state', { state: state({ mode: 'tournament' }) }],
  ['before original end', { state: state({ game_over: false }) }],
  ['no useful alternative', { state: state({ training: training({ alternativeDirections: [] }) }) }],
  ['already active', { state: state({ training: training({ phase: 'active' }) }) }],
  ['already ended', { state: state({ training: training({ phase: 'ended' }) }) }],
  ['unknown free mode', { freeMode: undefined }],
  ['no handler', { onBeginTraining: undefined }],
])('does not offer training for %s', (_name, props) => {
  expect(result(props)).not.toContain(offerLabel)
})

it('captures the original source identity in the offer instead of applying a later source', () => {
  const onBeginTraining = vi.fn()
  const original = state()
  const tree = Game2048Result({ state: original, freeMode: 'practice', onRestart: vi.fn(), onBeginTraining })
  const offer = button(tree, offerLabel)
  original.training!.sourceId = 'later-practice'
  ;(offer.props.onClick as () => void)()
  expect(onBeginTraining).toHaveBeenCalledExactlyOnceWith('original-practice')
})

it('labels the assisted score separately, keeps the fixed original and excludes normal result rewards and progress', () => {
  const value = result({ state: state({ score: 4096, training: training({ phase: 'ended' }) }),
    personal: freeSnapshot().personal, daily: freeSnapshot().daily, dailyChallenge: challenge })
  expect(value).toContain('Entrenamiento terminado</h2>')
  expect(value).toContain('Puntaje del entrenamiento: 4.096')
  expect(value).toContain('Entrenamiento · partida asistida')
  expect(value).toContain('Demostración sin anuncios')
  expect(value).toContain('Resultado original conservado:')
  expect(value).toContain('1.024 puntos · ficha máxima 128 · 90 movimientos.')
  expect(value).toContain('Última jugada original: Izquierda.')
  expect(value).toContain('Nueva partida sin ayuda')
  expect(value).not.toContain('Tu marca personal')
  expect(value).not.toContain('Nueva marca personal')
  expect(value).not.toContain('La meta diaria sigue pendiente')
  expect(value).not.toContain(offerLabel)
})

it('keeps normal daily progress and tournament confirmation available without a training offer', () => {
  const daily = result({ state: state({ training: undefined }), freeMode: 'daily', dailyChallenge: challenge, daily: freeSnapshot().daily })
  expect(daily).toContain('Partida del desafío terminada')
  expect(daily).toContain('La meta diaria sigue pendiente')
  expect(daily).not.toContain(offerLabel)
  const competitive = result({ tournament, state: state({ mode: 'tournament', result_status: 'completed', training: undefined }) })
  expect(competitive).toContain('Resultado confirmado por el servidor')
  expect(competitive).toContain('href="/ranking"')
  expect(competitive).not.toContain('Nueva partida sin ayuda')
})

it('exposes only useful alternatives with accessible controls and the preserved original result', () => {
  const onAlternative = vi.fn()
  const props = { training: training({ phase: 'active', awaitingAlternative: true }), onAlternative }
  const tree = Training2048View(props)
  const value = renderToStaticMarkup(tree)
  expect(value).toContain('aria-label="Direcciones alternativas de entrenamiento"')
  expect(value).toContain('aria-label="Probar dirección arriba en entrenamiento"')
  expect(value).toContain('aria-label="Probar dirección abajo en entrenamiento"')
  expect(value).not.toContain('aria-label="Probar dirección izquierda en entrenamiento"')
  expect(value).not.toContain('aria-label="Probar dirección derecha en entrenamiento"')
  expect(value).toContain('Última jugada original: Izquierda.')
  ;(button(tree, 'Arriba').props.onClick as () => void)()
  expect(onAlternative).toHaveBeenCalledExactlyOnceWith('up')
  const disabled = renderToStaticMarkup(createElement(Training2048View, { ...props, disabled: true }))
  expect(disabled.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
})

it('removes the special direction choice after the first alternative while keeping the original visible', () => {
  const value = renderToStaticMarkup(createElement(Training2048View, {
    training: training({ phase: 'active', awaitingAlternative: false }), onAlternative: vi.fn(),
  }))
  expect(value).toContain('Resultado original conservado')
  expect(value).not.toContain('Direcciones alternativas de entrenamiento')
  expect(Training2048View({ training: training(), onAlternative: vi.fn() })).toBeNull()
})

it('opens the adapter first and focuses the canvas only after its successful continuation', async () => {
  const beginTrainingDemo = vi.fn()
  const request = vi.fn().mockResolvedValue(true), completeDemo = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  fixture.session = { beginTrainingDemo }
  fixture.controller = { request, completeDemo }
  const tree = host()
  const panel = nodes(tree).find(node => node.type === Game2048Result)!
  const begin = panel.props.onBeginTraining as (sourceId: string) => void
  begin('original-practice')
  expect(request).toHaveBeenCalledExactlyOnceWith('original-practice')
  expect(beginTrainingDemo).not.toHaveBeenCalled()
  expect(fixture.focus).not.toHaveBeenCalled()
  const complete = panel.props.onContinueRewarded as (requestId: string) => void
  complete('pending-request')
  await Promise.resolve()
  expect(completeDemo).toHaveBeenCalledExactlyOnceWith('pending-request')
  expect(fixture.focus).toHaveBeenCalledTimes(1)
  complete('stale-request')
  await Promise.resolve()
  expect(fixture.focus).toHaveBeenCalledTimes(1)
})

it('routes the assisted restart to an ordinary unassisted practice and keeps the history explanation visible', () => {
  fixture.state = state({ score: 4096, training: training({ phase: 'ended' }) })
  const selectNext = vi.fn().mockReturnValue(true), start = vi.fn()
  fixture.session = { start }; fixture.experience = { selectNext }
  const tree = host()
  const value = renderToStaticMarkup(tree)
  expect(value).toContain('Las marcas e historial que ves corresponden a partidas sin ayuda')
  expect(value).toContain('Entrenamiento · partida asistida')
  const panel = nodes(tree).find(node => node.type === Game2048Result)!
  ;(panel.props.onRestart as () => void)()
  expect(selectNext).toHaveBeenCalledExactlyOnceWith('practice', challenge)
  expect(start).toHaveBeenCalledExactlyOnceWith(undefined, { freeMode: 'practice' })
  expect(fixture.focus).toHaveBeenCalledTimes(1)
})

it('sends an accessible alternative through the same session and returns focus to its active board', async () => {
  const active = state({ game_over: false, locked: false, training: training({ phase: 'active', awaitingAlternative: true }) })
  fixture.state = active
  const move = vi.fn().mockResolvedValue(undefined)
  fixture.session = { snapshot: () => active, move }
  const tree = host()
  const view = nodes(tree).find(node => node.type === Training2048View)!
  ;(view.props.onAlternative as (direction: string) => void)('up')
  await Promise.resolve()
  expect(move).toHaveBeenCalledExactlyOnceWith('up')
  expect(fixture.focus).toHaveBeenCalledTimes(1)
})

it('defensively rejects a training action when the host is in daily mode', () => {
  fixture.free = { ...freeSnapshot(), mode: 'daily' }
  fixture.state = state({ game_over: false, locked: false, training: training({ phase: 'active' }) })
  const beginTrainingDemo = vi.fn()
  fixture.session = { beginTrainingDemo }
  const activeTree = host()
  expect(nodes(activeTree).some(node => node.type === Training2048View)).toBe(false)
  fixture.state = state()
  const resultTree = host()
  const panel = nodes(resultTree).find(node => node.type === Game2048Result)!
  ;(panel.props.onBeginTraining as (sourceId: string) => void)('original-practice')
  expect(beginTrainingDemo).not.toHaveBeenCalled()
  expect(fixture.focus).not.toHaveBeenCalled()
})
