import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown>, index: 0, expanded: false, ready: true, failure: '', progress: 0 }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useRef: () => ({ current: null }), useEffect: () => {}, useLayoutEffect: () => {},
  useState: (initial: unknown) => { const index = fixture.index++; return [index === 1 ? fixture.ready : index === 2 ? fixture.failure : index === 3 ? fixture.progress : index === 4 ? fixture.state : index === 5 ? fixture.expanded : initial, vi.fn()] },
}))
vi.mock('next/link', () => ({ default: 'a' }))
import { Unity2048 } from '@/components/game/unity-2048'
const tournament = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout', existingGameId: 'g1', leaderboardUrl: '/tournaments/t1/leaderboard' }
beforeEach(() => { fixture.index = 0; fixture.expanded = false; fixture.ready = true; fixture.failure = ''; fixture.progress = 0 })
it('offers all 16 confirmed cells with row and column headers and silent clock updates', () => {
  fixture.state = { started: true, cells: [2,4,8,16,32,64,128,256,512,1024,2048,0,0,0,0,0], score: 2048, time_left_seconds: 45 }
  const before = renderToStaticMarkup(createElement(Unity2048, { tournament }))
  expect(before.match(/<td>/g)).toHaveLength(16)
  expect(before).toContain('<summary>Consultar tablero</summary>'); expect(before).toContain('scope="row"')
  expect(before).toContain('Columna 4'); expect(before.match(/<td>Vacía<\/td>/g)).toHaveLength(5)
  expect(before).toContain('aria-live="off"'); expect(before).toContain('puntaje 2.048')
  fixture.index = 0; fixture.state.time_left_seconds = 44
  const after = renderToStaticMarkup(createElement(Unity2048, { tournament }))
  expect(after.slice(after.indexOf('<table'), after.indexOf('</table>'))).toBe(before.slice(before.indexOf('<table'), before.indexOf('</table>')))
  fixture.index = 0; fixture.state.cells = [4,...Array(15).fill(0)]; fixture.state.score = 4
  const moved = renderToStaticMarkup(createElement(Unity2048, { tournament }))
  expect(moved.match(/<td>Vacía<\/td>/g)).toHaveLength(15); expect(moved).toContain('puntaje 4')
})
it('renders the confirmed result and ranking without start or restart controls', () => {
  fixture.state = { started: true, game_over: true, locked: true, score: 128, can_restart: false,
    message: 'Sin movimientos · puntaje final: 128', time_left_seconds: 0 }
  const html = renderToStaticMarkup(createElement(Unity2048, { tournament }))
  expect(html).toContain('Sin movimientos · puntaje final: 128'); expect(html).toContain('href="/tournaments/t1/leaderboard"')
  expect(html).not.toMatch(/<button[^>]*>Iniciar partida<\/button>/); expect(html).not.toMatch(/<button[^>]*>Nueva partida<\/button>/); expect(html).not.toContain('Recuperar partida')
})
it.each([false, true])('shows a prominent practice result and disables the capsule after no moves, expanded=%s', expanded => {
  fixture.expanded = expanded
  fixture.state = { started: true, game_over: true, locked: true, can_restart: true,
    score: 1024, end_reason: 'no_moves', message: 'Práctica terminada' }
  const html = renderToStaticMarkup(createElement(Unity2048))
  expect(html).toContain('Práctica terminada</h2>')
  expect(html).toContain('No quedan movimientos disponibles.')
  expect(html).toContain('Puntaje final: 1.024')
  expect(html).toMatch(/<iframe[^>]*tabindex="-1" inert=""/)
  expect(html).not.toContain('Cargando tabla de resultados')
})
it('does not show an end panel or results for a network-uncertain active game', () => {
  fixture.state = { started: true, game_over: false, locked: true, can_recover: true,
    score: 256, message: 'No se confirmó el movimiento.' }
  const html = renderToStaticMarkup(createElement(Unity2048, { tournament: { ...tournament, resultsUrl: '/api/tournaments/t1/leaderboard' } }))
  expect(html).not.toContain('Partida terminada</h2>')
  expect(html).not.toContain('Cargando tabla de resultados')
  expect(html).toContain('Recuperar partida')
})
it('loads tournament results automatically only after the confirmed end', () => {
  fixture.state = { started: true, game_over: true, locked: true, score: 256,
    result_status: 'completed', end_reason: 'no_moves', message: 'Sin movimientos' }
  const html = renderToStaticMarkup(createElement(Unity2048, { tournament: { ...tournament, resultsUrl: '/api/tournaments/t1/leaderboard' } }))
  expect(html).toContain('Partida terminada</h2>')
  expect(html).toContain('Puntaje final: 256')
  expect(html).toContain('Cargando tabla de resultados')
  expect(html).toContain('Resultado confirmado por el servidor.')
})
it('renders recovery for an existing game whose state could not be read', () => {
  fixture.state = { started: false, game_over: false, locked: true, can_recover: true, score: 0, message: 'No se pudo recuperar la partida.' }
  const html = renderToStaticMarkup(createElement(Unity2048, { tournament }))
  expect(html).toContain('Recuperar partida'); expect(html).not.toMatch(/<button[^>]*>Iniciar partida<\/button>/); expect(html).not.toContain('Ver ranking')
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
    const html = renderToStaticMarkup(createElement(Unity2048, { tournament: { ...tournament, existingGameId: existing ? 'g1' : undefined } }))
    expect(html).toContain(`data-view="${view}"`)
    expect(html).toContain(action); expect(html).toContain(state.message)
    const frameEnd = html.indexOf('</iframe>')
    expect(html.indexOf('aria-label="Controles de la plataforma"')).toBeLessThan(frameEnd)
    expect(html.indexOf('aria-label="Estado de la partida"')).toBeGreaterThan(frameEnd)
    expect(html).not.toContain('Nueva partida')
    if ('can_recover' in state && !state.can_recover) expect(html).not.toContain('Recuperar partida')
    if ('game_over' in state && state.game_over) { expect(html).not.toContain('Recuperar partida'); expect(html).not.toMatch(/<button[^>]*>Iniciar partida<\/button>/) }
    expect(html).toContain(expanded ? 'Volver a la página' : 'Ampliar juego')
  })

  it(`keeps practice start and restart in the ${view} platform toolbar`, () => {
    fixture.expanded = expanded; fixture.state = { started: false, can_restart: true, score: 0 }
    expect(renderToStaticMarkup(createElement(Unity2048))).toMatch(/<button[^>]*>Iniciar partida<\/button>/)
    fixture.index = 0; fixture.state = { started: true, can_restart: true, score: 4 }
    expect(renderToStaticMarkup(createElement(Unity2048))).toMatch(/<button[^>]*>Nueva partida<\/button>/)
  })

  it(`keeps load failure retry and exit available in the ${view} shell`, () => {
    fixture.expanded = expanded; fixture.ready = false; fixture.failure = 'Unity no pudo cargar.'
    fixture.state = { started: false, can_restart: true, score: 0 }
    const html = renderToStaticMarkup(createElement(Unity2048))
    expect(html).toContain('role="alert"'); expect(html).toContain('Reintentar carga')
    expect(html).toContain(expanded ? 'Volver a la página' : 'Ampliar juego')
    expect(html).toContain('disabled=""')
    expect(html).toContain('tabindex="-1" inert=""')
  })
}

it.each([false, true])('offers first-move guidance before starting, expanded=%s', expanded => {
  fixture.expanded = expanded; fixture.state = { started: false, score: 0, can_restart: true }
  const html = renderToStaticMarkup(createElement(Unity2048))
  expect(html).toContain('<summary>Cómo jugar</summary>'); expect(html).toContain('dos fichas de 2 forman una de 4')
  expect(html).toContain('en el teléfono, desliza sobre el tablero'); expect(html).not.toContain('<table')
  const descriptionId = html.match(/<iframe[^>]*aria-describedby="([^"]+)"/)?.[1]
  expect(descriptionId).toBeTruthy(); expect(html).toContain(`<p id="${descriptionId}">`)
  expect(html).toContain('Tab permite salir'); expect(html).toContain('Escape vuelve')
})
it('exposes progress values without repeating percentage announcements or a pre-game score', () => {
  fixture.ready = false; fixture.state = { started: false }
  const statuses = (html: string) => [...html.matchAll(/<p[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/g)].map(match => match[1])
  const before = renderToStaticMarkup(createElement(Unity2048))
  expect(before).toContain('role="progressbar"'); expect(before).toContain('aria-valuenow="0"'); expect(before).toContain('aria-busy="true"')
  expect(statuses(before).filter(Boolean)).toEqual(['Cargando 2048. El juego estará disponible al terminar la carga.'])
  fixture.index = 0; fixture.progress = 75
  const after = renderToStaticMarkup(createElement(Unity2048))
  expect(after).toContain('aria-valuenow="75"'); expect(statuses(after)).toEqual(statuses(before))
})
it('gives each capsule its own control description and keeps the confirmed score atomic', () => {
  fixture.state = { started: true, score: 4, message: 'Partida confirmada' }
  const html = renderToStaticMarkup(createElement('div', null, createElement(Unity2048), createElement(Unity2048)))
  const references = [...html.matchAll(/<iframe[^>]*aria-describedby="([^"]+)"/g)].map(match => match[1])
  expect(references).toHaveLength(2); expect(new Set(references).size).toBe(2)
  for (const id of references) expect(html).toContain(`<p id="${id}">`)
  expect(html).toMatch(/<p[^>]*role="status" aria-atomic="true">Puntaje: 4<\/p>/)
})
