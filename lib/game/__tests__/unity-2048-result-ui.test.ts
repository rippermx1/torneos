import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown>, index: 0, expanded: false, ready: true, failure: '' }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useRef: () => ({ current: null }), useEffect: () => {}, useLayoutEffect: () => {},
  useState: (initial: unknown) => { const index = fixture.index++; return [index === 1 ? fixture.ready : index === 2 ? fixture.failure : index === 4 ? fixture.state : index === 5 ? fixture.expanded : initial, vi.fn()] },
}))
vi.mock('next/link', () => ({ default: 'a' }))
import { Unity2048 } from '@/components/game/unity-2048'
const tournament = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout', existingGameId: 'g1', leaderboardUrl: '/tournaments/t1/leaderboard' }
beforeEach(() => { fixture.index = 0; fixture.expanded = false; fixture.ready = true; fixture.failure = '' })
it('renders the confirmed result and ranking without start or restart controls', () => {
  fixture.state = { started: true, game_over: true, locked: true, score: 128, can_restart: false,
    message: 'Sin movimientos · puntaje final: 128', time_left_seconds: 0 }
  const html = renderToStaticMarkup(Unity2048({ tournament }))
  expect(html).toContain('Sin movimientos · puntaje final: 128'); expect(html).toContain('href="/tournaments/t1/leaderboard"')
  expect(html).not.toContain('Iniciar partida'); expect(html).not.toContain('Nueva partida'); expect(html).not.toContain('Recuperar partida')
})
it('renders recovery for an existing game whose state could not be read', () => {
  fixture.state = { started: false, game_over: false, locked: true, can_recover: true, score: 0, message: 'No se pudo recuperar la partida.' }
  const html = renderToStaticMarkup(Unity2048({ tournament }))
  expect(html).toContain('Recuperar partida'); expect(html).not.toContain('Iniciar partida'); expect(html).not.toContain('Ver ranking')
})

for (const expanded of [false, true]) {
  const view = expanded ? 'expanded' : 'normal'
  it.each([
    ['before start', { started: false, locked: true, message: 'Inicia cuando estés listo.' }, false, 'Iniciar partida'],
    ['active request', { started: true, locked: true, can_recover: false, time_left_seconds: 45, message: 'Partida competitiva' }, true, 'Tiempo 00:45'],
    ['unknown move', { started: true, locked: true, can_recover: true, time_left_seconds: 45, message: 'No se pudo confirmar el movimiento.' }, true, 'Recuperar partida'],
    ['timeout result', { started: true, locked: true, game_over: true, score: 128, time_left_seconds: 0, message: 'Tiempo terminado · puntaje final: 128' }, true, 'Ver ranking'],
    ['no moves result', { started: true, locked: true, game_over: true, score: 256, time_left_seconds: 0, message: 'Sin movimientos · puntaje final: 256' }, true, 'Ver ranking'],
  ])(`keeps platform controls and feedback in the ${view} shell: %s`, (_name, state, existing, action) => {
    fixture.expanded = expanded; fixture.state = { score: 0, ...state }
    const html = renderToStaticMarkup(Unity2048({ tournament: { ...tournament, existingGameId: existing ? 'g1' : undefined } }))
    expect(html).toContain(`data-view="${view}"`)
    expect(html).toContain(action); expect(html).toContain(state.message)
    const frameEnd = html.indexOf('</iframe>')
    expect(html.indexOf('aria-label="Controles de la plataforma"')).toBeLessThan(frameEnd)
    expect(html.indexOf('aria-label="Estado de la partida"')).toBeGreaterThan(frameEnd)
    expect(html).not.toContain('Nueva partida')
    if ('can_recover' in state && !state.can_recover) expect(html).not.toContain('Recuperar partida')
    if ('game_over' in state && state.game_over) { expect(html).not.toContain('Recuperar partida'); expect(html).not.toContain('Iniciar partida') }
    expect(html).toContain(expanded ? 'Volver a la página' : 'Ampliar juego')
  })

  it(`keeps practice start and restart in the ${view} platform toolbar`, () => {
    fixture.expanded = expanded; fixture.state = { started: false, can_restart: true, score: 0 }
    expect(renderToStaticMarkup(Unity2048({}))).toContain('Iniciar partida')
    fixture.index = 0; fixture.state = { started: true, can_restart: true, score: 4 }
    expect(renderToStaticMarkup(Unity2048({}))).toContain('Nueva partida')
  })

  it(`keeps load failure retry and exit available in the ${view} shell`, () => {
    fixture.expanded = expanded; fixture.ready = false; fixture.failure = 'Unity no pudo cargar.'
    fixture.state = { started: false, can_restart: true, score: 0 }
    const html = renderToStaticMarkup(Unity2048({}))
    expect(html).toContain('role="alert"'); expect(html).toContain('Reintentar carga')
    expect(html).toContain(expanded ? 'Volver a la página' : 'Ampliar juego')
    expect(html).toContain('disabled=""')
  })
}
