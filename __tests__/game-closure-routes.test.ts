import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  game: {} as Record<string, unknown>, tournament: {} as Record<string, unknown>,
  update: {} as { data: unknown; error: unknown }, recovery: {} as { data: unknown; error: unknown },
  queries: [] as { table: string; write: boolean; filters: [string, unknown][] }[],
  authenticated: true, registered: true,
}))
vi.mock('@/lib/supabase/auth', () => ({ requireAnyRoleForApi: async () => fixture.authenticated
  ? { ok: true, access: { userId: 'closure-user' } }
  : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) } }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }),
  getRequestIp: () => '127.0.0.1', rateLimitResponse: () => new Response('', { status: 429 }) }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const query = { table, write: false, filters: [] as [string, unknown][] }
  const run = async (recovery: boolean) => {
    fixture.queries.push(query)
    if (query.write) return fixture.update
    if (recovery) return fixture.recovery
    const owner = query.filters.find(([key]) => key === 'user_id')?.[1]
    return { data: table === 'games' ? (owner === fixture.game.user_id ? fixture.game : null)
      : table === 'tournaments' ? fixture.tournament : table === 'profiles' ? { is_banned: false }
        : fixture.registered ? { id: 'registration' } : null, error: null }
  }
  const q = { select: () => q, update: () => { query.write = true; return q },
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return q },
    single: () => run(false), maybeSingle: () => run(true) }
  return q
} }) }))
import { POST as timeout } from '@/app/api/tournaments/[id]/game/timeout/route'
import { POST as start } from '@/app/api/tournaments/[id]/game/start/route'
import { POST as move } from '@/app/api/tournaments/[id]/game/move/route'

let sequence = 0
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T16:00:00Z'))
  fixture.queries = []; fixture.authenticated = true; fixture.registered = true
  fixture.game = { id: 'closure-game', user_id: 'closure-user', status: 'active', final_score: 4,
    move_count: 2, current_board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], seed: 'test-seed',
    started_at: '2026-10-01T15:58:00Z', end_reason: null }
  fixture.tournament = { id: `closure-tournament-${++sequence}`, status: 'live', min_players: 1,
    play_window_start: '2026-10-01T15:00:00Z', play_window_end: '2026-10-01T17:00:00Z', max_game_duration_seconds: 60 }
  fixture.update = { data: { id: 'closure-game', status: 'completed', final_score: 16,
    end_reason: 'timeout', ended_at: '2026-10-01T16:00:00Z' }, error: null }
  fixture.recovery = { data: null, error: null }
})
afterEach(() => vi.useRealTimers())
const routes = [ ['timeout', timeout, 200, 'timedOut'], ['start', start, 400, 'timeout'], ['move', move, 400, 'timeout'] ] as const
function request() { return new Request('http://local.test/game', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gameId: 'closure-game', direction: 'left', moveNumber: 4, clientTimestamp: Date.now() }) }) }
function params() { return { params: Promise.resolve({ id: String(fixture.tournament.id) }) } }

describe.each(routes)('%s expiration persistence', (_name, route, status, flag) => {
  it('returns the score from the persisted UPDATE rather than the stale pre-move read', async () => {
    const response = await route(request(), params()), data = await response.json()
    expect(response.status).toBe(status)
    expect(data[flag]).toBe(true); expect(data.score).toBe(16)
    expect(data.endedAt).toBe('2026-10-01T16:00:00Z')
    const writes = fixture.queries.filter(q => q.write)
    expect(writes).toHaveLength(1)
    expect(writes[0].filters).toEqual([['id','closure-game'],['tournament_id',fixture.tournament.id],['user_id','closure-user'],['status','active']])
  })
  it('does not confirm expiration on write failure or disclose database diagnostics', async () => {
    fixture.update = { data: null, error: { message: 'private_database_details' } }
    const response = await route(request(), params()), data = await response.json()
    expect(response.status).toBe(503); expect(data.code).toBe('GAME_CLOSURE_UNCONFIRMED')
    expect(data[flag]).toBeUndefined(); expect(JSON.stringify(data)).not.toContain('private_database_details')
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it('does not turn zero rows and an active recovery read into success', async () => {
    fixture.update = { data: null, error: null }; fixture.recovery = { data: fixture.game, error: null }
    const response = await route(request(), params())
    expect(response.status).toBe(503)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it('recovers the winner of a concurrent timeout without overwriting its score or endedAt', async () => {
    fixture.update = { data: null, error: null }
    fixture.recovery = { data: { id: 'closure-game', status: 'completed', final_score: 128,
      end_reason: 'timeout', ended_at: '2026-10-01T15:59:59Z' }, error: null }
    const response = await route(request(), params()), data = await response.json()
    expect(response.status).toBe(status); expect(data[flag]).toBe(true)
    expect(data.score).toBe(128); expect(data.endedAt).toBe('2026-10-01T15:59:59Z')
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
    const recovery = fixture.queries.at(-1)
    expect(recovery?.filters).toEqual([['id','closure-game'],['tournament_id',fixture.tournament.id],['user_id','closure-user']])
  })
  it('does not relabel a concurrently completed no_moves game as timeout', async () => {
    fixture.update = { data: null, error: null }
    fixture.recovery = { data: { id: 'closure-game', status: 'completed', final_score: 256,
      end_reason: 'no_moves', ended_at: '2026-10-01T15:59:59Z' }, error: null }
    const response = await route(request(), params()), data = await response.json()
    expect(data[flag]).toBe(false); expect(data.score).toBe(256)
  })
  it('does not confirm a closure when recovery fails', async () => {
    fixture.update = { data: null, error: null }; fixture.recovery = { data: null, error: { message: 'read failed' } }
    expect((await route(request(), params())).status).toBe(503)
  })
  it('rejects another player before any write', async () => {
    fixture.game.user_id = 'other-user'
    if (_name === 'start') fixture.registered = false
    expect((await route(request(), params())).status).toBe(_name === 'start' ? 403 : 404)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it('rejects anonymous requests before querying data', async () => {
    fixture.authenticated = false
    expect((await route(request(), params())).status).toBe(401)
    expect(fixture.queries).toHaveLength(0)
  })
})

it('does not confirm window-expiration from move when persistence fails', async () => {
  fixture.tournament.play_window_end = '2026-10-01T15:59:59Z'
  fixture.update = { data: null, error: { message: 'write failed' } }
  expect((await move(request(), params())).status).toBe(503)
})
it('does not update a game when server time has not reached the deadline', async () => {
  fixture.game.started_at = '2026-10-01T15:59:45Z'
  const response = await timeout(request(), params()), data = await response.json()
  expect(response.status).toBe(200); expect(data.timedOut).toBe(false)
  expect(data.deadlineAt).toBe('2026-10-01T16:00:45.000Z')
  expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
})
it('is idempotent for an already persisted timeout without writing again', async () => {
  fixture.game.status = 'completed'; fixture.game.end_reason = 'timeout'; fixture.game.final_score = 512
  const response = await timeout(request(), params()), data = await response.json()
  expect(response.status).toBe(200); expect(data).toMatchObject({ timedOut: true, score: 512 })
  expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
})
