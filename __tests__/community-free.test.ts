import { describe, expect, it } from 'vitest'
import { PLATFORM_BUSINESS_RULES } from '@/lib/business/rules'
import { calculatePresetFinancials, DEFAULT_TOURNAMENT_PRESET_KEY, getTournamentPreset } from '@/lib/tournament/finance'
import { buildCommunityFreeTournamentFields, canStartCommunityFreeTournament, COMMUNITY_FREE_BUSINESS_RULE_VERSION, COMMUNITY_FREE_CONFIG,
  communityFreeLatestStartMs, isCommunityFreePresetKey, isCommunityFreeTournament } from '@/lib/tournament/community-free'

const dates = { registrationOpensAt: '2026-10-17T09:00:00-03:00', playWindowStart: '2026-10-17T12:00:00-03:00' }

describe('governed community free 2048 format', () => {
  it('has no financial authority and retains the paid version/default', () => {
    const fields = buildCommunityFreeTournamentFields(dates)
    expect(fields).toMatchObject({ ...COMMUNITY_FREE_CONFIG, tournament_type: 'freeroll', business_rule_version: 4,
      is_test: false, entry_fee_cents: 0, prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0,
      min_players: 2, max_players: 15, max_game_duration_seconds: 300, skill_tier: null })
    expect(COMMUNITY_FREE_BUSINESS_RULE_VERSION).toBe(4)
    expect(PLATFORM_BUSINESS_RULES.policyVersion).toBe(3)
    expect(DEFAULT_TOURNAMENT_PRESET_KEY).toBe('commercial_v1')
    expect(getTournamentPreset('commercial_v1')).toMatchObject({ entryFeePesos: 5000, prize1Pesos: 24750, prize2Pesos: 8250, minPlayers: 12, maxPlayers: 15 })
    expect(getTournamentPreset('freeroll_v1')).toMatchObject({ prize1Pesos: 5000, maxPlayers: 10 })
    expect(getTournamentPreset('internal_test_v1')).toMatchObject({ isTest: true, prize1Pesos: 1, minPlayers: 1 })
  })

  it('normalizes absolute instants and retains exactly 24 elapsed hours across DST', () => {
    const fields = buildCommunityFreeTournamentFields({ registrationOpensAt: '2026-09-05T15:00:00-04:00', playWindowStart: '2026-09-05T21:00:00-04:00' })
    expect(fields.play_window_start).toBe('2026-09-06T01:00:00.000Z')
    expect(Date.parse(fields.play_window_end) - Date.parse(fields.play_window_start)).toBe(86_400_000)
    expect(isCommunityFreeTournament(fields)).toBe(true)
  })

  it('does not treat a key, legacy freeroll, test marker or altered economy as the format', () => {
    const fields = buildCommunityFreeTournamentFields(dates)
    expect(isCommunityFreePresetKey('community_free_v1')).toBe(true)
    expect(isCommunityFreePresetKey('freeroll_v1')).toBe(false)
    expect(isCommunityFreeTournament({ preset_key: 'community_free_v1' })).toBe(false)
    for (const patch of [{ entry_fee_cents: 100 }, { prize_1st_cents: 1 }, { is_test: true }, { skill_tier: 'novato' },
      { business_rule_version: 3 }, { min_players: 1 }, { max_players: 16 }, { max_game_duration_seconds: 301 },
      { tournament_type: 'standard' }, { game_type: 'other' }, { platform_fee_bps: 0 }, { play_window_end: fields.play_window_start }])
      expect(isCommunityFreeTournament({ ...fields, ...patch }), JSON.stringify(patch)).toBe(false)
  })

  it('rejects ambiguous/invalid time inputs and registration at or after start', () => {
    for (const value of ['invalid', '2026-10-17', '2026-10-17T12:00:00', '2026-99-99T12:00:00Z', '2026-02-30T12:00:00Z'])
      expect(() => buildCommunityFreeTournamentFields({ ...dates, playWindowStart: value })).toThrow()
    expect(() => buildCommunityFreeTournamentFields({ registrationOpensAt: dates.playWindowStart, playWindowStart: dates.playWindowStart })).toThrow()
  })

  it('reserves a full five minutes instead of accepting a last-second start', () => {
    const fields = buildCommunityFreeTournamentFields(dates)
    const latest = Date.parse(fields.play_window_end) - 300_000
    expect(communityFreeLatestStartMs(fields)).toBe(latest)
    expect(communityFreeLatestStartMs({ ...fields, max_game_duration_seconds: 600 })).toBeNull()
    const tournament = { ...fields, status: 'live' as const }
    expect(canStartCommunityFreeTournament(tournament, latest)).toBe(true)
    expect(canStartCommunityFreeTournament(tournament, latest + 1)).toBe(false)
    expect(canStartCommunityFreeTournament(tournament, Date.parse(fields.play_window_start) - 1)).toBe(false)
    expect(canStartCommunityFreeTournament({ ...tournament, status: 'completed' }, latest)).toBe(false)
    expect(canStartCommunityFreeTournament(tournament, NaN)).toBe(false)
  })

  it('reports zero monetary movement without an infinite funding requirement', () => {
    const finances = calculatePresetFinancials(getTournamentPreset('community_free_v1')!)
    expect(finances.totalPrizesCents).toBe(0)
    expect(finances.requiredMinPlayers).toBe(0)
    for (const snapshot of [finances.min, finances.max]) expect(snapshot).toMatchObject({ grossRevenueCents: 0,
      netSalesCents: 0, vatDebitCents: 0, flowFeeNetCents: 0, fixedPrizeCents: 0, contributionCents: 0 })
    expect(calculatePresetFinancials(getTournamentPreset('freeroll_v1')!).requiredMinPlayers).toBe(Infinity)
  })
})
