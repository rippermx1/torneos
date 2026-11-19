// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TournamentCard } from '@/components/tournament/tournament-card'
import type { PublicTournament } from '@/lib/tournament/availability'
import { toChallenge } from '@entities/challenge'
import { getContent } from '@shared/content'
import { ChallengeCard, toChallengeCardViewModel } from '@widgets/challenge-card'

// Parity guard while the legacy card still exists (removed in phase 6):
// the content-driven card must show exactly the same text.
afterEach(cleanup)

const opens = Date.parse('2026-09-30T18:00:00Z')
const start = Date.parse('2026-09-30T20:00:00Z')
const end = Date.parse('2026-09-30T21:00:00Z')
const base: PublicTournament = {
  id: 't1', name: 'Copa 2048', game_type: '2048_score', status: 'open',
  entry_fee_cents: 500000, prize_1st_cents: 2475000, prize_2nd_cents: 825000, prize_3rd_cents: 0,
  registration_opens_at: new Date(opens).toISOString(), play_window_start: new Date(start).toISOString(),
  play_window_end: new Date(end).toISOString(), min_players: 12, max_players: 15, max_game_duration_seconds: 600,
  registeredCount: 12,
}

function text(element: React.ReactElement) {
  const { container } = render(element)
  const value = container.textContent
  cleanup()
  return value
}

describe('challenge card parity with the legacy tournament card', () => {
  it.each([
    ['open', base, opens],
    ['upcoming', base, opens - 1],
    ['free and full', { ...base, entry_fee_cents: 0, registeredCount: 15 }, opens],
    ['unknown count', { ...base, registeredCount: null }, opens],
    ['live', base, start],
    ['closed', base, end],
    ['finalizing', { ...base, status: 'finalizing' as const }, end],
    ['completed', { ...base, status: 'completed' as const }, end],
    ['cancelled', { ...base, status: 'cancelled' as const }, opens],
  ])('%s', (_name, tournament, now) => {
    const viewModel = toChallengeCardViewModel({
      challenge: toChallenge(tournament), now, content: getContent('challenge-card'), href: `/tournaments/${tournament.id}`,
    })
    expect(text(<ChallengeCard viewModel={viewModel} />)).toBe(text(<TournamentCard tournament={tournament} now={now} />))
  })
})
