import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tournament: {} as Record<string, unknown>, registered: 2, completed: 2,
  results: [] as Array<Record<string, unknown>>, reads: [] as string[],
  writes: [] as Array<{ table: string; value: unknown }>,
  rpcs: [] as Array<{ name: string; args: unknown }>,
  refunds: vi.fn(), prizeEmail: vi.fn(), opsEmail: vi.fn(), integrity: vi.fn(),
}))
vi.mock('@/lib/tournament/refunds', () => ({ issueFlowRefunds: state.refunds }))
vi.mock('@/lib/email/tournament-notifications', () => ({ sendTournamentPrizeEmail: state.prizeEmail }))
vi.mock('@/lib/email/ops-notifications', () => ({ sendOpsAlertEmail: state.opsEmail }))
vi.mock('@/lib/anticheat/integrity', () => ({ requireIntegrityClearance: state.integrity }))
vi.mock('@/lib/anticheat/winner-review', () => ({ reviewWinnerStats: () => [], computeIntervalStats: () => ({}) }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://torneos-dev.vercel.app' }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'qa@example.com', user_metadata: {} } } }) } },
  from(table: string) {
    state.reads.push(table)
    let single = false
    let positiveOnly = false
    const query = {
      select() { return query }, eq() { return query }, in() { return query }, order() { return query }, limit() { return query },
      gt(key: string) { positiveOnly = key === 'prize_awarded_cents'; return query },
      single() { single = true; return Promise.resolve(result()) }, maybeSingle() { single = true; return Promise.resolve(result()) },
      update(value: Record<string, unknown>) { state.writes.push({ table, value }); Object.assign(state.tournament, value); return query },
      upsert(value: unknown) { state.writes.push({ table, value }); return query },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    function result() {
      const rows = positiveOnly ? state.results.filter(row => Number(row.prize_awarded_cents) > 0) : state.results
      return { error: null, data: table === 'tournaments' ? single ? state.tournament : [state.tournament]
        : table === 'tournament_results' ? rows : table === 'games' && single ? null : [],
      count: table === 'registrations' ? state.registered : state.completed }
    }
    return query
  },
  async rpc(name: string, args: unknown) {
    state.rpcs.push({ name, args })
    if (name === 'finalize_tournament') state.tournament.status = 'completed'
    if (name === 'cancel_tournament') state.tournament.status = 'cancelled'
    return { error: null, data: { refunds_to_issue: 0, entry_fee_cents: 0 } }
  },
}) }))

import { forceFinalizeTournament, processTournamentTransitions } from '@/lib/tournament/lifecycle'

const now = Date.parse('2026-10-16T15:00:00Z')
const id = '33333333-3333-4333-8333-333333333333'
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks()
  state.registered = 2; state.completed = 2; state.reads = []; state.writes = []; state.rpcs = []
  state.tournament = { id, name: 'QA community', status: 'live', game_type: '2048_score', tournament_type: 'freeroll',
    preset_key: 'community_free_v1', business_rule_version: 4, is_test: false, skill_tier: null, prize_model: 'fixed',
    entry_fee_cents: 0, prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0,
    prize_fund_bps: 5500, platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
    min_players: 2, max_players: 15, max_game_duration_seconds: 300,
    registration_opens_at: new Date(now - 120_000).toISOString(), play_window_start: new Date(now - 60_000).toISOString(),
    play_window_end: new Date(now + 86_340_000).toISOString() }
  state.results = [1, 2].map(rank => ({ user_id: `player-${rank}`, rank, final_score: rank === 1 ? 256 : 128, prize_awarded_cents: 0 }))
})
afterEach(() => vi.useRealTimers())

describe('community lifecycle preserves normal closure without monetary effects', () => {
  it('blocks an early close when a registered participant has no completed attempt', async () => {
    state.completed = 1
    await expect(forceFinalizeTournament(id)).rejects.toThrow(/inscritos sin partida completada/)
    expect(state.rpcs).toEqual([]); expect(state.writes).toEqual([])
  })
  it('allows protected early closure when every registered attempt completed, without changing the 24-hour window', async () => {
    const end = state.tournament.play_window_end
    const result = await forceFinalizeTournament(id)
    expect(result.action).toBe('finalized'); expect(state.tournament.play_window_end).toBe(end)
    expect(state.integrity).toHaveBeenCalledOnce()
    expect(state.rpcs).toEqual([{ name: 'finalize_tournament', args: { p_tournament_id: id } }])
    expect(state.writes).toEqual([{ table: 'tournaments', value: { status: 'finalizing' } }])
    expect(state.reads).not.toContain('player_ratings')
    expect(state.refunds).not.toHaveBeenCalled(); expect(state.prizeEmail).not.toHaveBeenCalled(); expect(state.opsEmail).not.toHaveBeenCalled()
  })
  it('does not finalize a completed tournament again', async () => {
    state.tournament.status = 'completed'
    await expect(forceFinalizeTournament(id)).rejects.toThrow(/completed/)
    expect(state.rpcs).toEqual([])
  })
  it('leaves the existing integrity review gate effective for a zero-prize tournament', async () => {
    state.integrity.mockRejectedValueOnce(new Error('INTEGRITY_REVIEW_REQUIRED'))
    await expect(forceFinalizeTournament(id)).rejects.toThrow('INTEGRITY_REVIEW_REQUIRED')
    expect(state.rpcs).toEqual([])
  })
  it('cancels below the minimum with no Flow refund', async () => {
    state.tournament.status = 'open'; state.registered = 1; state.completed = 0
    const results = await processTournamentTransitions()
    expect(results).toMatchObject([{ action: 'cancelled', detail: { playerCount: 1, refunds_initiated: 0 } }])
    expect(state.rpcs.map(rpc => rpc.name)).toEqual(['cancel_tournament'])
    expect(state.refunds).not.toHaveBeenCalled(); expect(state.writes).toEqual([])
  })
  it('retains normal rating and prize notifications for a paid preset', async () => {
    Object.assign(state.tournament, { preset_key: 'commercial_v1', tournament_type: 'standard', business_rule_version: 3,
      entry_fee_cents: 500_000, prize_1st_cents: 2_475_000, prize_2nd_cents: 825_000,
      min_players: 12, max_players: 15, max_game_duration_seconds: 600 })
    state.results[0].prize_awarded_cents = 2_475_000
    expect((await forceFinalizeTournament(id)).action).toBe('finalized')
    expect(state.writes.find(write => write.table === 'player_ratings')?.value).toEqual([
      expect.objectContaining({ profile_id: 'player-1', games_rated: 1, rating: 256 }),
      expect.objectContaining({ profile_id: 'player-2', games_rated: 1, rating: 128 }),
    ])
    expect(state.prizeEmail).toHaveBeenCalledOnce()
  })
})
