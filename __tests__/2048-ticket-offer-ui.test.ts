import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Unity2048State } from '@/lib/game/unity-2048-session'

const fixture = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, getUser: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => { fixture.getUser(); return fixture.user } }))
vi.mock('@/lib/tournament/public-catalog', () => ({ getPublicTournaments: async () => ({ tournaments: [], error: null, asOf: 0 }) }))
vi.mock('@/components/game/unity-2048', () => ({ Unity2048: () => null }))
vi.mock('@/components/game/2048-ticket-offer-observer', () => ({ TicketOffer2048Observer: () => null }))

import TicketPage from '@/app/(public)/play/2048/ticket/page'
import PracticePage from '@/app/(public)/play/page'
import { TicketOffer2048Banner } from '@/components/game/2048-ticket-offer-banner'
import { TicketOffer2048Observer } from '@/components/game/2048-ticket-offer-observer'
import { Game2048Result } from '@/components/game/2048-game-result'
import * as domain from '@/lib/tournament/ticket-offer'

const html = (value: ReactNode) => renderToStaticMarkup(value)
const page = (from?: string | string[]) => TicketPage({ searchParams: Promise.resolve({ from }) })
function nodes(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
const links = (value: string) => [...value.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
const finalState: Unity2048State = { cells: Array(16).fill(2), score: 1024, move_number: 100, started: true,
  game_over: true, locked: true, can_restart: true, mode: 'practice', message: 'Práctica terminada', time_left_seconds: -1 }
const marker = { runId: '11111111-1111-4111-8111-111111111111' }

beforeEach(() => {
  vi.restoreAllMocks(); fixture.getUser.mockClear(); fixture.user = null
  vi.stubEnv('TORNEOS_ENV', 'cloud-development')
})
afterEach(() => vi.unstubAllEnvs())

it('lets a guest read a complete proposed offer with no enrollment, payment or interest form', async () => {
  const value = html(await page('practice'))
  expect(value).toContain('Torneos con ticket: todavía no disponibles</h1>')
  expect(value).toContain('$5.000 CLP')
  expect(value).toContain('$33.000 CLP')
  expect(value).toContain('$24.750 CLP')
  expect(value).toContain('$8.250 CLP')
  expect(value).toContain('10 minutos')
  expect(value).toContain('Mínimo 12 · máximo 15')
  expect(value).toContain('24 horas desde el inicio que se publique')
  expect(value).toContain('no hay fecha publicada, cupos ofrecidos')
  expect(value).toContain('sólo serían pagaderos si un torneo futuro se habilita y celebra conforme a sus reglas')
  expect(value).toContain('condiciones de cancelación y devolución')
  expect(value).toContain('no se alcanza el mínimo')
  expect(value).not.toMatch(/<(form|input|button)\b/)
  expect(links(value).every(href => href === '/play' || href.startsWith('/sign-in?next='))).toBe(true)
  expect(value).not.toContain('/checkout')
  expect(value).not.toContain('/sign-up')
  expect(fixture.getUser).toHaveBeenCalledTimes(1)
})

it('renders prices, limits and durations from the server projection rather than repeating monetary constants in the page', async () => {
  const offer = domain.get2048TicketOffer('result')
  vi.spyOn(domain, 'get2048TicketOffer').mockReturnValueOnce({ ...offer,
    entryFee: { cents: 610000, pesos: 6100, label: '$6.100' },
    durationMinutes: 17, windowHours: 48, minPlayers: 20, maxPlayers: 25,
    prizes: { ...offer.prizes, total: { cents: 4100000, pesos: 41000, label: '$41.000' } } })
  const value = html(await page('result'))
  expect(value).toContain('$6.100 CLP')
  expect(value).toContain('$41.000 CLP')
  expect(value).toContain('17 minutos')
  expect(value).toContain('48 horas')
  expect(value).toContain('Mínimo 20 · máximo 25')
  expect(value).not.toContain('$5.000')
  expect(value).not.toContain('10 minutos')
})

it.each(['practice', 'result'] as const)('preserves the %s destination through the existing sign-in link', async from => {
  const value = html(await page(from)), login = links(value).find(href => href.startsWith('/sign-in?'))!
  expect(new URL(login, 'https://local.test').searchParams.get('next')).toBe(`/play/2048/ticket?from=${from}`)
  expect(value).toContain('sin cuenta')
})

it.each([undefined, '//elsewhere.test', ['practice', 'result'], '<script>wrong</script>'])('normalizes an unrecognized source to a direct informational visit: %s', async from => {
  const tree = await page(from), value = html(tree)
  const login = links(value).find(href => href.startsWith('/sign-in?'))!
  expect(new URL(login, 'https://local.test').searchParams.get('next')).toBe('/play/2048/ticket')
  const observer = nodes(tree).find(node => node.type === TicketOffer2048Observer)!
  expect(observer.props.source).toBe('direct')
  expect(value).not.toContain('elsewhere.test')
  expect(value).not.toContain('&lt;script&gt;')
})

it('shows the same offer to an authenticated reader without asking for another sign-in', async () => {
  fixture.user = { id: 'reader', is_anonymous: false }
  const value = html(await page('result'))
  expect(value).toContain('Tu sesión está iniciada')
  expect(value).toContain('$5.000 CLP')
  expect(value).toContain('Consultar esta ficha no te inscribe')
  expect(links(value)).toEqual(['/play'])
  expect(fixture.getUser).toHaveBeenCalledTimes(1)
})

it('keeps an anonymous Auth session on the readable guest path', async () => {
  fixture.user = { is_anonymous: true }
  expect(links(html(await page('practice'))).some(href => href.startsWith('/sign-in?'))).toBe(true)
})

it('explains the separation from free play and records only local consultation, not subscription or sales', async () => {
  const value = html(await page())
  expect(value).toContain('El desafío diario y los retos comunitarios gratuitos no requieren comprar este ticket')
  expect(value).toContain('no entregan entradas, saldo ni ventajas en un torneo')
  expect(value).toContain('El puntaje de práctica y el entrenamiento asistido no son resultados competitivos')
  expect(value).toContain('sólo en este navegador')
  expect(value).toContain('exportar el registro desde «Mi progreso»')
  expect(value).toContain('No es una suscripción, reserva ni compra')
})

it('uses the trusted development category for local observation without accepting editable metadata', async () => {
  fixture.user = { is_anonymous: false, app_metadata: { qa_2048_training_development: marker } }
  const synthetic = nodes(await page('result')).find(node => node.type === TicketOffer2048Observer)!
  expect(synthetic.props).toMatchObject({ category: 'synthetic', source: 'result' })
  fixture.user = { is_anonymous: false, user_metadata: { qa_2048_training_development: marker } }
  const ordinary = nodes(await page('practice')).find(node => node.type === TicketOffer2048Observer)!
  expect(ordinary.props.category).toBe('observed_browser')
  vi.stubEnv('TORNEOS_ENV', 'production')
  fixture.user = { is_anonymous: false, app_metadata: { qa_2048_training_development: marker } }
  const production = nodes(await page()).find(node => node.type === TicketOffer2048Observer)!
  expect(production.props.category).toBe('observed_browser')
})

it('gives a new observation identity to a changed source or trusted category during client navigation', async () => {
  const observer = (tree: ReactNode) => nodes(tree).find(node => node.type === TicketOffer2048Observer)!
  const practice = observer(await page('practice')), result = observer(await page('result'))
  expect(practice.key).not.toBeNull()
  expect(result.key).not.toBe(practice.key)
  fixture.user = { is_anonymous: false, app_metadata: { qa_2048_training_development: marker } }
  expect(observer(await page('result')).key).not.toBe(result.key)
})

it('connects the practice page to a proposed ticket separately from its free community challenge', async () => {
  const value = html(await PracticePage({ searchParams: Promise.resolve({}) }))
  expect(value).toContain('href="/play/2048/ticket?from=practice"')
  expect(value).toContain('Próximo reto comunitario de 2048')
  expect(value).toContain('La práctica y el desafío diario siguen siendo gratuitos')
  expect(value).not.toContain('/checkout')
})

it('uses the supplied server projection in the practice banner', () => {
  const offer = domain.get2048TicketOffer('practice')
  const value = html(createElement(TicketOffer2048Banner, { offer: { ...offer,
    entryFee: { cents: 730000, pesos: 7300, label: '$7.300' }, durationMinutes: 18 } }))
  expect(value).toContain('$7.300 CLP')
  expect(value).toContain('18 minutos')
  expect(value).not.toContain('$5.000')
})

it.each(['practice', 'daily', 'assisted'] as const)('offers the informational result link after a free %s game', mode => {
  const state: Unity2048State = mode === 'assisted' ? { ...finalState, training: {
    phase: 'ended', sourceId: 'original', continuationId: 'continuation', originalScore: 512, originalHighestTile: 128,
    originalMoves: 40, originalDirection: 'up', alternativeDirections: ['left'], awaitingAlternative: false, demonstration: true,
  } } : finalState
  const value = html(createElement(Game2048Result, { state, onRestart: vi.fn(), freeMode: mode === 'daily' ? 'daily' : 'practice' }))
  expect(value).toContain('href="/play/2048/ticket?from=result"')
  expect(value).toContain('todavía no disponibles')
})

it('keeps ticket promotion out of a competitive result, including a carried assisted state', () => {
  const value = html(createElement(Game2048Result, { state: { ...finalState, mode: 'tournament', result_status: 'completed', training: {
    phase: 'ended', sourceId: 'old-practice', continuationId: 'old-continuation', originalScore: 512, originalHighestTile: 128,
    originalMoves: 40, originalDirection: 'up', alternativeDirections: ['left'], awaitingAlternative: false, demonstration: true,
  } },
    tournament: { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout', leaderboardUrl: '/ranking' }, onRestart: vi.fn() }))
  expect(value).toContain('Resultado confirmado por el servidor')
  expect(value).not.toContain('/play/2048/ticket')
})
