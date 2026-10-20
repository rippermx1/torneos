import { beforeEach, expect, it, vi } from 'vitest'
type Result = { data: unknown; error: unknown }
const state = vi.hoisted(() => ({ responses: {} as Record<string, Result>, calls: [] as { table: string; method: string; args: unknown[] }[] }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const query: Record<string, unknown> = { then: (resolve: (value: Result) => unknown) => Promise.resolve(state.responses[table]).then(resolve) }
  for (const method of ['select','eq','in','order','limit','maybeSingle']) query[method] = (...args: unknown[]) => {
    state.calls.push({ table, method, args }); return query
  }
  return query
} }) }))
import { loadTournamentLeaderboard } from '@/lib/tournament/leaderboard'
beforeEach(() => {
  state.calls = []; state.responses = {
    tournaments: { data: { id: 't1', status: 'live' }, error: null },
    games: { data: [{ user_id: 'u1', final_score: 4, highest_tile: 4, move_count: 2, status: 'completed' }], error: null },
    tournament_results: { data: [{ user_id: 'u1', final_score: 4, rank: 2, prize_awarded_cents: 0 }], error: null },
    profiles: { data: [{ id: 'u1', username: 'Jugador' }], error: null },
  }
})
it('uses the existing live ranking filters and deterministic tie breakers', async () => {
  const data = await loadTournamentLeaderboard('t1')
  expect(data?.usernameMap).toEqual({ u1: 'Jugador' })
  expect(state.calls.filter(call => call.table === 'games' && call.method === 'order').map(call => call.args)).toEqual([
    ['final_score', { ascending: false }], ['highest_tile', { ascending: false }],
    ['move_count', { ascending: true }], ['user_id', { ascending: true }],
  ])
  expect(state.calls).toContainEqual({ table: 'games', method: 'in', args: ['status', ['completed','active']] })
  expect(state.calls).toContainEqual({ table: 'games', method: 'limit', args: [50] })
})
it('uses official persisted results after completion instead of recalculating from games', async () => {
  state.responses.tournaments.data = { id: 't1', status: 'completed' }
  const data = await loadTournamentLeaderboard('t1')
  expect(data?.rows[0]).toMatchObject({ rank: 2, prize_awarded_cents: 0, highest_tile: 0 })
  expect(state.calls.some(call => call.table === 'games')).toBe(false)
})
it('returns no tournament only for a confirmed missing row', async () => {
  state.responses.tournaments.data = null; expect(await loadTournamentLeaderboard('missing')).toBeNull()
  state.responses.tournaments.error = { message: 'database unavailable' }
  await expect(loadTournamentLeaderboard('t1')).rejects.toThrow('consultar el torneo')
})
it.each(['games','profiles'])('propagates %s errors instead of returning a fabricated empty ranking', async table => {
  state.responses[table].error = { message: 'failure' }
  await expect(loadTournamentLeaderboard('t1')).rejects.toThrow()
})
