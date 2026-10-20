import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { COMMUNITY_FREE_CONFIG } from '@/lib/tournament/community-free'
import type { PublicTournament } from '@/lib/tournament/availability'
import type { Game2048Results } from '@/lib/game/2048-results'

const fixture = vi.hoisted(() => ({ ranking: null as unknown }))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found') } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('@/lib/tournament/leaderboard', () => ({ loadTournamentLeaderboard: async () => fixture.ranking }))

import { TournamentCard } from '@/components/tournament/tournament-card'
import { CommunityChallengeBanner } from '@/components/tournament/community-challenge-banner'
import { Game2048ResultsTable } from '@/components/game/2048-game-result'
import { TournamentPresetForm } from '@/components/admin/tournament-preset-form'
import LeaderboardPage from '@/app/(public)/tournaments/[id]/leaderboard/page'

const now = Date.parse('2026-10-16T12:00:00Z')
const tournament = {
  ...COMMUNITY_FREE_CONFIG,
  id: 'community-1', name: 'Reto de la comunidad', status: 'open',
  registration_opens_at: '2026-10-16T11:00:00Z',
  play_window_start: '2026-10-17T12:00:00Z',
  play_window_end: '2026-10-18T12:00:00Z',
  registeredCount: 2,
} satisfies PublicTournament & typeof COMMUNITY_FREE_CONFIG
const results = {
  tournamentId: tournament.id, phase: 'official', presetKey: 'community_free_v1',
  rows: [{ position: 1, name: 'Jugador', score: 2048, highestTile: 512, prizeCents: 0, isMe: true }],
} satisfies Game2048Results
const html = <P extends object>(component: ComponentType<P>, props: P) => renderToStaticMarkup(createElement(component, props))

beforeEach(() => { fixture.ranking = null })

it('labels the community card from its preset and exposes rules without a prize or price amount', () => {
  const value = html(TournamentCard, { tournament, now })
  expect(value).toContain('reto comunitario')
  expect(value).toContain('Clasificación sin premios')
  expect(value).toContain('Un intento por cuenta')
  expect(value).toContain('Último inicio:')
  expect(value).toContain('href="/tournaments/community-1"')
  expect(value).not.toContain('Premio total fijo')
  expect(value).not.toContain('Ver reglas y premios')
  expect(value).not.toContain('$')
})

it('retains prizes for the historical promotional freeroll instead of treating every free entry as community', () => {
  const value = html(TournamentCard, { tournament: { ...tournament, preset_key: 'freeroll_v1', prize_1st_cents: 500000 }, now })
  expect(value).toContain('Premio total fijo')
  expect(value).toContain('$5.000')
  expect(value).not.toContain('reto comunitario')
})

it('does not invent a community date when no event has been scheduled', () => {
  const value = html(CommunityChallengeBanner, { tournament: null, now })
  expect(value).toContain('todavía no está programada')
  expect(value).toContain('href="/tournaments"')
  expect(value).not.toContain('Inscripción hasta')
})

it('distinguishes failure to load an event from the absence of a scheduled event', () => {
  const value = html(CommunityChallengeBanner, { tournament: null, error: true, now })
  expect(value).toContain('No pudimos confirmar la próxima fecha')
  expect(value).not.toContain('todavía no está programada')
})

it('connects practice to the actual event details and distinguishes a live event', () => {
  const value = html(CommunityChallengeBanner, { tournament, now: Date.parse(tournament.play_window_start) + 1 })
  expect(value).toContain('Reto comunitario en curso')
  expect(value).toContain('href="/tournaments/community-1"')
  expect(value).toContain('inscripción cerrada')
  expect(value).toContain('el desafío diario')
})

it('shows actual maximum tile and position in official community results, with no prize column', () => {
  const value = html(Game2048ResultsTable, { results })
  expect(value).toContain('Resultados oficiales')
  expect(value).toContain('Puesto')
  expect(value).toContain('Ficha máxima')
  expect(value).toContain('512')
  expect(value).not.toContain('Premio')
  expect(value).not.toContain('$')
})

it('supports the server-rendered preset while an older results payload omits its metadata', () => {
  const value = html(Game2048ResultsTable, { results: { ...results, presetKey: undefined }, presetKey: 'community_free_v1' })
  expect(value).toContain('Ficha máxima')
  expect(value).not.toContain('Premio')
})

it('preserves official prize presentation for a paid tournament', () => {
  const value = html(Game2048ResultsTable, { results: { ...results, presetKey: 'commercial_v1', rows: [{ ...results.rows[0], prizeCents: 500000 }] } })
  expect(value).toContain('Premio')
  expect(value).toContain('$5.000')
})

function form(playWindowEnd: string) {
  return html(TournamentPresetForm, { action: async () => {}, registrationOpensAt: '2026-04-03T10:00',
    playWindowStart: '2026-04-04T12:00', playWindowEnd })
}

it('defaults to the community preset and accepts 24 real hours across the Chile DST change', () => {
  const value = form('2026-04-05T11:00')
  expect(value).toContain('name="preset_key" value="community_free_v1"')
  expect(value).toContain('Todos los niveles · sin división')
  expect(value).toContain('name="skill_tier" value=""')
  expect(value.match(/<input[^>]*name="play_window_end"[^>]*>/)?.[0]).toContain('readOnly=""')
  expect(value).toContain('Publicar reto gratuito')
  expect(value).not.toMatch(/type="submit"[^>]*\sdisabled=/)
  const review = value.slice(value.indexOf('3. Revisa antes de publicar'))
  expect(review).toContain('Uno por cuenta')
  expect(review).not.toContain('Premio fijo')
  expect(review).not.toContain('Costo Flow')
  expect(review).not.toContain('gasto promocional')
})

it('disables a community window that looks like one calendar day but lasts 25 hours', () => {
  const value = form('2026-04-05T12:00')
  expect(value).toContain('ventana exacta de 24 horas')
  expect(value).toMatch(/type="submit"[^>]*disabled=""/)
})

it('renders the official full leaderboard with maximum tile and no monetary cells', async () => {
  fixture.ranking = { tournament: { ...tournament, status: 'completed' },
    rows: [{ user_id: 'u1', rank: 1, final_score: 2048, highest_tile: 512, prize_awarded_cents: 0 }], usernameMap: { u1: 'Jugador' } }
  const value = renderToStaticMarkup(await LeaderboardPage({ params: Promise.resolve({ id: tournament.id }) }))
  expect(value).toContain('Clasificación del reto')
  expect(value).toContain('Ficha máxima')
  expect(value).toContain('512')
  expect(value).not.toContain('>Premio<')
  expect(value).not.toContain('$')
  expect(value).toContain('2048 incorpora azar')
})
