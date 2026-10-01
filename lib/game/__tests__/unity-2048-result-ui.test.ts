import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ state: {} as Record<string, unknown>, index: 0 }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useRef: () => ({ current: null }), useEffect: () => {}, useLayoutEffect: () => {},
  useState: (initial: unknown) => { const index = fixture.index++; return [index === 1 ? true : index === 4 ? fixture.state : initial, vi.fn()] },
}))
vi.mock('next/link', () => ({ default: 'a' }))
import { Unity2048 } from '@/components/game/unity-2048'
const tournament = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout', existingGameId: 'g1', leaderboardUrl: '/tournaments/t1/leaderboard' }
beforeEach(() => { fixture.index = 0 })
it('renders the confirmed result and ranking without start or restart controls', () => {
  fixture.state = { started: true, game_over: true, locked: true, score: 128, can_restart: false,
    message: 'Sin movimientos · puntaje final: 128', time_left_seconds: 0 }
  const html = renderToStaticMarkup(Unity2048({ tournament }))
  expect(html).toContain('Sin movimientos · puntaje final: 128'); expect(html).toContain('href="/tournaments/t1/leaderboard"')
  expect(html).not.toContain('Iniciar partida'); expect(html).not.toContain('Nueva partida'); expect(html).not.toContain('Recuperar partida')
})
it('renders recovery for an existing game whose state could not be read', () => {
  fixture.state = { started: false, game_over: false, locked: true, score: 0, message: 'No se pudo recuperar la partida.' }
  const html = renderToStaticMarkup(Unity2048({ tournament }))
  expect(html).toContain('Recuperar partida'); expect(html).not.toContain('Iniciar partida'); expect(html).not.toContain('Ver ranking')
})
