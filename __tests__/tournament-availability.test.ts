import { describe, expect, it } from 'vitest'
import { getTournamentAvailability, normalizeRegistrationCount, sortPublicTournaments, type PublicTournament } from '@/lib/tournament/availability'

const opens = Date.parse('2026-09-30T18:00:00Z')
const start = Date.parse('2026-09-30T20:00:00Z')
const end = Date.parse('2026-09-30T21:00:00Z')
const tournament: PublicTournament = {
  id: '10000000-0000-0000-0000-000000000001', name: '2048', game_type: '2048_score', status: 'open',
  entry_fee_cents: 500000, prize_1st_cents: 2475000, prize_2nd_cents: 825000, prize_3rd_cents: 0,
  registration_opens_at: new Date(opens).toISOString(), play_window_start: new Date(start).toISOString(),
  play_window_end: new Date(end).toISOString(), min_players: 12, max_players: 15, max_game_duration_seconds: 600,
  registeredCount: 12,
}

describe('public tournament availability', () => {
  it.each([
    [opens - 1, 'upcoming', false], [opens, 'open', true], [start - 1, 'open', true],
    [start, 'live', false], [end - 1, 'live', false], [end, 'closed', false],
  ])('respects window boundaries at %s', (now, kind, canRegister) => {
    expect(getTournamentAvailability(tournament, now)).toMatchObject({ kind, canRegister })
  })

  it.each([15, 16])('does not offer registration when count is %s', (registeredCount) => {
    expect(getTournamentAvailability({ ...tournament, registeredCount }, opens)).toMatchObject({ kind: 'full', slots: 0, canRegister: false })
  })

  it('distinguishes a verified zero from a failed count', () => {
    expect(getTournamentAvailability({ ...tournament, registeredCount: 0 }, opens)).toMatchObject({ kind: 'open', slots: 15 })
    expect(getTournamentAvailability({ ...tournament, registeredCount: null }, opens)).toMatchObject({ kind: 'unknown', slots: null, canRegister: false })
  })

  it.each(['cancelled', 'completed', 'finalizing'] as const)('respects terminal state %s regardless of timestamps', (status) => {
    expect(getTournamentAvailability({ ...tournament, status }, opens).canRegister).toBe(false)
  })

  it.each([
    { registration_opens_at: 'invalid' }, { play_window_end: tournament.play_window_start },
    { game_type: 'alien_run' }, { max_players: 0 }, { status: 'live' as const },
  ])('does not promise availability for inconsistent data %s', (change) => {
    expect(getTournamentAvailability({ ...tournament, ...change }, opens)).toMatchObject({ kind: 'unknown', canRegister: false })
  })

  it.each([null, undefined, '0', -1, 0.5, NaN, Infinity])('rejects unverified count %s', (count) => {
    expect(normalizeRegistrationCount(count)).toBeNull()
  })

  it('prioritizes available registration over earlier live tournaments without mutating input', () => {
    const live = { ...tournament, id: 'live', play_window_start: new Date(opens - 1000).toISOString(), registration_opens_at: new Date(opens - 2000).toISOString() }
    const full = { ...tournament, id: 'full', registeredCount: 15 }
    const upcoming = { ...tournament, id: 'upcoming', registration_opens_at: new Date(opens + 1000).toISOString() }
    const source = [live, full, upcoming, tournament]
    expect(sortPublicTournaments(source, opens).map((t) => t.id)).toEqual([tournament.id, 'upcoming', 'full', 'live'])
    expect(source[0]).toBe(live)
  })
})
