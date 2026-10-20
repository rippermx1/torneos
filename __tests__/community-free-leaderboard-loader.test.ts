import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: unknown }
const state = vi.hoisted(() => ({ responses: {} as Record<string, Result>, calls: [] as { table: string; method: string; args: unknown[] }[] }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'private-A' } }, error: null }) } }),
  createAdminClient: () => ({ from: (table: string) => {
    const query: Record<string, unknown> = { then: (resolve: (value: Result) => unknown) => Promise.resolve(state.responses[table]).then(resolve) }
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle']) query[method] = (...args: unknown[]) => {
      state.calls.push({ table, method, args }); return query
    }
    return query
  } }),
}))
import { loadTournamentLeaderboard } from '@/lib/tournament/leaderboard'
import { GET } from '@/app/api/tournaments/[id]/leaderboard/route'

const id = '00000000-0000-4000-8000-000000000001'
const get = () => GET(new Request(`https://torneos.example/api/tournaments/${id}/leaderboard`), { params: Promise.resolve({ id }) })
beforeEach(() => {
  state.calls = []
  state.responses = {
    tournaments: { data: { id, status: 'completed', game_type: '2048_score', preset_key: 'community_free_v1' }, error: null },
    tournament_results: { data: [{ user_id: 'private-B', rank: 1, final_score: 200, prize_awarded_cents: 0 },
      { user_id: 'private-A', rank: 2, final_score: 100, prize_awarded_cents: 0 }], error: null },
    games: { data: [{ user_id: 'private-A', highest_tile: 32, final_score: 100 },
      { user_id: 'private-B', highest_tile: 64, final_score: 200 }], error: null },
    profiles: { data: [{ id: 'private-A', username: 'A' }, { id: 'private-B', username: 'B' }], error: null },
  }
})

describe('real community leaderboard loader and API', () => {
  it('uses persisted official ranks and joins the matching completed server game for highest tile', async () => {
    const result = await loadTournamentLeaderboard(id)
    expect(result?.rows).toEqual([
      { user_id: 'private-B', rank: 1, final_score: 200, prize_awarded_cents: 0, highest_tile: 64 },
      { user_id: 'private-A', rank: 2, final_score: 100, prize_awarded_cents: 0, highest_tile: 32 },
    ])
    expect(state.calls).toContainEqual({ table: 'games', method: 'eq', args: ['status', 'completed'] })
    expect(state.calls).toContainEqual({ table: 'games', method: 'eq', args: ['tournament_id', id] })
    expect(state.calls).toContainEqual({ table: 'games', method: 'in', args: ['user_id', ['private-B', 'private-A']] })
    expect(state.calls.filter(call => call.table === 'tournament_results' && call.method === 'order').map(call => call.args))
      .toEqual([['rank', { ascending: true }]])
  })

  it.each([
    [{ user_id: 'private-A', highest_tile: 32, final_score: 100 }],
    [{ user_id: 'private-A', highest_tile: 32, final_score: 100 }, { user_id: 'private-B', highest_tile: 64, final_score: 201 }],
    [{ user_id: 'private-A', highest_tile: 32, final_score: 100 }, { user_id: 'private-B', highest_tile: -1, final_score: 200 }],
  ])('fails visibly for missing, mismatched or invalid completed games', async (...games) => {
    state.responses.games.data = games
    await expect(loadTournamentLeaderboard(id)).rejects.toThrow('Resultado oficial incompleto')
  })

  it('preserves the published paid/legacy highest_tile=0 behavior without requesting games', async () => {
    state.responses.tournaments.data = { id, status: 'completed', game_type: '2048_score', preset_key: 'commercial_v1' }
    const result = await loadTournamentLeaderboard(id)
    expect(result?.rows.every(row => row.highest_tile === 0)).toBe(true)
    expect(state.calls.some(call => call.table === 'games')).toBe(false)
  })

  it('returns preset metadata and confirmed highest tiles without private account IDs', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json()
    expect(body).toEqual({ tournamentId: id, presetKey: 'community_free_v1', phase: 'official', rows: [
      { position: 1, name: 'B', score: 200, highestTile: 64, prizeCents: 0, isMe: false },
      { position: 2, name: 'A', score: 100, highestTile: 32, prizeCents: 0, isMe: true },
    ] })
    expect(JSON.stringify(body)).not.toContain('private-')
  })

  it('does not turn a game query failure into zero highest tiles or a successful empty ranking', async () => {
    state.responses.games.error = { message: 'private database detail' }
    await expect(loadTournamentLeaderboard(id)).rejects.toThrow('confirmar las fichas')
    const response = await get()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database')
  })
})
