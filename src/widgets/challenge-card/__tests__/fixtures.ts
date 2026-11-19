import { toChallenge } from '@entities/challenge'

// Same data as the challenge entity tests.
export const opens = Date.parse('2026-09-30T18:00:00Z')
export const start = Date.parse('2026-09-30T20:00:00Z')
const end = Date.parse('2026-09-30T21:00:00Z')

export const challenge = toChallenge({
  id: '10000000-0000-0000-0000-000000000001', name: 'Copa 2048', game_type: '2048_score', status: 'open',
  entry_fee_cents: 500000, prize_1st_cents: 2475000, prize_2nd_cents: 825000, prize_3rd_cents: 0,
  registration_opens_at: new Date(opens).toISOString(), play_window_start: new Date(start).toISOString(),
  play_window_end: new Date(end).toISOString(), min_players: 12, max_players: 15, max_game_duration_seconds: 600,
  registeredCount: 12,
})
