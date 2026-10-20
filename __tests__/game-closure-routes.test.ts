import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  game: {} as Record<string, unknown>, tournament: {} as Record<string, unknown>,
  update: {} as { data: unknown; error: unknown }, recovery: {} as { data: unknown; error: unknown },
  queries: [] as { table: string; write: boolean; filters: [string, unknown][] }[],
  inserting: false,
  authenticated: true, registered: true,
  banned: false,
  userId: 'closure-user', profileMissing: false, profileReadError: false, limitOk: true,
  limits: [] as { key: string; limit: number; windowMs: number; onError?: string }[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  readError: false,
  finalMoveRow: null as Record<string, unknown> | null,
  insertError: null as { code: string; message: string } | null,
  concurrentGame: null as Record<string, unknown> | null,
  concurrentReadError: false,
  rpcError: null as { code: string; message: string } | null,
  rpcReadError: false,
}))
vi.mock('@/lib/supabase/auth', () => ({ requireAnyRoleForApi: async () => fixture.authenticated
  ? { ok: true, access: { userId: fixture.userId } }
  : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) } }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async (options: typeof fixture.limits[number]) => {
  fixture.limits.push(options); return { ok: fixture.limitOk }
},
  getRequestIp: (req: Request) => req.headers.get('x-forwarded-for') ?? '127.0.0.1',
  rateLimitResponse: () => new Response('', { status: 429 }) }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
  fixture.rpcCalls.push({ name, args })
  if (fixture.finalMoveRow) fixture.game = fixture.finalMoveRow
  if (fixture.rpcReadError) fixture.readError = true
  return { data: null, error: fixture.rpcError }
}), from: (table: string) => {
  const query = { table, write: false, filters: [] as [string, unknown][] }
  const run = async (recovery: boolean) => {
    fixture.queries.push(query)
    if (fixture.inserting && table === 'games' && query.write) return fixture.insertError
      ? { data: null, error: fixture.insertError } : { data: { id: 'new-clock-game' }, error: null }
    if (fixture.inserting && table === 'games') return { data: fixture.concurrentGame,
      error: fixture.concurrentReadError ? { message: 'private read failure' } : null }
    if (query.write) return fixture.update
    if (recovery) return fixture.recovery
    if (table === 'games' && fixture.readError) return { data: null, error: { message: 'private read failure' } }
    if (table === 'profiles' && fixture.profileReadError) return { data: null, error: { message: 'private profile failure' } }
    const owner = query.filters.find(([key]) => key === 'user_id')?.[1]
    const id = query.filters.find(([key]) => key === 'id')?.[1]
    const tournamentId = query.filters.find(([key]) => key === 'tournament_id')?.[1]
    return { data: table === 'games' ? (owner === fixture.game.user_id
      && (!id || id === fixture.game.id) && tournamentId === fixture.tournament.id ? fixture.game : null)
      : table === 'tournaments' ? { ...fixture.tournament } : table === 'profiles' ? fixture.profileMissing ? null : { is_banned: fixture.banned }
        : fixture.registered ? { id: 'registration' } : null, error: null }
  }
  const q = { select: () => q, update: () => { query.write = true; return q },
    insert: () => { fixture.inserting = true; query.write = true; return q },
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return q },
    single: () => run(false), maybeSingle: () => run(query.filters.some(([key]) => key === 'id')) }
  return q
} }) }))
import { POST as timeout } from '@/app/api/tournaments/[id]/game/timeout/route'
import { POST as start } from '@/app/api/tournaments/[id]/game/start/route'
import { POST as move } from '@/app/api/tournaments/[id]/game/move/route'

let sequence = 0
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T16:00:00Z'))
  fixture.queries = []; fixture.authenticated = true; fixture.registered = true; fixture.inserting = false
  fixture.banned = false; fixture.limits = []; fixture.rpcCalls = []
  fixture.userId = 'closure-user'; fixture.profileMissing = false; fixture.profileReadError = false; fixture.limitOk = true
  fixture.readError = false
  fixture.finalMoveRow = null
  fixture.insertError = null; fixture.concurrentGame = null; fixture.concurrentReadError = false
  fixture.rpcError = null; fixture.rpcReadError = false
  fixture.game = { id: 'closure-game', user_id: 'closure-user', status: 'active', final_score: 4,
    move_count: 2, current_board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], seed: 'test-seed',
    started_at: '2026-10-01T15:58:00Z', end_reason: null, ended_at: null }
  fixture.tournament = { id: `closure-tournament-${++sequence}`, status: 'live', min_players: 1,
    play_window_start: '2026-10-01T15:00:00Z', play_window_end: '2026-10-01T17:00:00Z', max_game_duration_seconds: 60 }
  fixture.update = { data: { ...fixture.game, id: 'closure-game', status: 'completed', final_score: 16,
    end_reason: 'timeout', ended_at: '2026-10-01T16:00:00Z' }, error: null }
  fixture.recovery = { data: null, error: null }
})

describe('concurrent competitive start', () => {
  function race() {
    fixture.concurrentGame = { ...fixture.game, started_at: '2026-10-01T15:59:45Z' }
    fixture.game.user_id = 'other-user'
    fixture.insertError = { code: '23505', message: 'private unique constraint detail' }
  }
  it('recovers the same owned winner without retrying INSERT or exposing its seed', async () => {
    race()
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ gameId: 'closure-game', resuming: true, score: 4, moveNumber: 4 })
    expect(data.board).toEqual(fixture.concurrentGame?.current_board)
    expect(data.seed).toBeUndefined(); expect(data.nextRngStates).toEqual([])
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
    expect(fixture.queries.at(-1)?.filters).toEqual([['tournament_id',fixture.tournament.id],['user_id','closure-user']])
  })
  it('preserves a concurrently completed result without RNG or another game', async () => {
    race(); fixture.concurrentGame = { ...fixture.concurrentGame, status: 'completed',
      final_score: 128, end_reason: 'no_moves', ended_at: '2026-10-01T16:00:00Z' }
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ score: 128, gameOver: true, nextRngStates: [], resuming: true })
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it.each(['missing','read failure'])('leaves state unconfirmed on %s after the unique conflict', async failure => {
    race()
    if (failure === 'missing') fixture.concurrentGame = null
    else fixture.concurrentReadError = true
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(503); expect(data.code).toBe('GAME_STATE_UNCONFIRMED')
    expect(data.score).toBeUndefined(); expect(JSON.stringify(data)).not.toContain('private')
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it('does not recover arbitrary insert errors as a successful start', async () => {
    race(); fixture.insertError = { code: 'PGRST000', message: 'transport failure' }
    expect((await start(request(start), params())).status).toBe(500)
    expect(fixture.queries.filter(q => q.table === 'games' && !q.write)).toHaveLength(1)
  })
  it.each(['IDENTITY_ALREADY_PARTICIPATING', 'IDENTITY_STATE_UNCONFIRMED', 'ACCOUNT_SUSPENDED'])('rejects the database eligibility guard %s without recovering an unrelated session', async message => {
    race(); fixture.insertError = { code: message === 'ACCOUNT_SUSPENDED' ? 'PT403' : 'PT409', message }
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(403); expect(data.code).toBe(message); expect(data.gameId).toBeUndefined()
    expect(fixture.queries.filter(q => q.table === 'games' && !q.write)).toHaveLength(1)
  })
})

describe('atomic movement conflicts', () => {
  function conflict(code = 'PT409') {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    fixture.rpcError = { code, message: 'private RPC diagnostic' }
  }
  it('rejects a sanction persisted after the API profile precheck', async () => {
    conflict('PT403')
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(403); expect(data.code).toBe('ACCOUNT_SUSPENDED')
    expect(data.score).toBeUndefined(); expect(JSON.stringify(data)).not.toContain('private')
    expect(fixture.rpcCalls).toHaveLength(1)
  })
  it('returns a confirmed terminal winner when timeout committed before the RPC', async () => {
    conflict()
    fixture.finalMoveRow = { ...fixture.game, status: 'completed', end_reason: 'timeout', final_score: 16,
      ended_at: '2026-10-01T16:00:00Z' }
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(400)
    expect(data).toMatchObject({ moved: false, score: 16, gameOver: true, stateConfirmed: true, endReason: 'timeout' })
    expect(fixture.rpcCalls).toHaveLength(1)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
    expect(fixture.queries.at(-1)?.filters).toEqual([['id','closure-game'],['tournament_id',fixture.tournament.id],['user_id','closure-user']])
  })
  it.each(['PT409','23505'])('returns a recoverable active conflict for %s without replaying it', async code => {
    conflict(code)
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(409)
    expect(data).toMatchObject({ moved: false, score: 4, gameOver: false, stateConfirmed: true })
    expect(fixture.rpcCalls).toHaveLength(1)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
    expect(JSON.stringify(data)).not.toContain('private')
  })
  it('confirms persisted timeout when the deadline expires while waiting for the RPC', async () => {
    conflict(); fixture.finalMoveRow = { ...fixture.game, started_at: '2026-10-01T15:58:00Z' }
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(400)
    expect(data).toMatchObject({ moved: false, score: 16, gameOver: true, endReason: 'timeout' })
    expect(fixture.rpcCalls).toHaveLength(1)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it('leaves a rejected move unconfirmed when its recovery read fails', async () => {
    conflict(); fixture.rpcReadError = true
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(503); expect(data.code).toBe('GAME_STATE_UNCONFIRMED')
    expect(data.score).toBeUndefined(); expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
})
afterEach(() => vi.useRealTimers())
const routes = [ ['timeout', timeout, 200, 'timedOut'], ['start', start, 200, 'timeout'], ['move', move, 400, 'timeout'] ] as const
function validBody(route: typeof move) {
  if (route === start) return {}
  if (route === timeout) return { gameId: 'closure-game' }
  return { gameId: 'closure-game', direction: 'left', moveNumber: 4, clientTimestamp: Date.now() }
}
function request(route: typeof move = move, ip = '192.0.2.1') { return bodyRequest(validBody(route), ip) }
function params() { return { params: Promise.resolve({ id: String(fixture.tournament.id) }) } }

function bodyRequest(body: unknown, ip = '192.0.2.1') {
  return new Request('http://local.test/game', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) })
}
describe('adversarial competitive requests', () => {
  it.each(routes)('%s stops before reading game data when the quota is denied', async (_name, route) => {
    fixture.limitOk = false
    expect((await route(request(route), params())).status).toBe(429)
    expect(fixture.queries).toEqual([]); expect(fixture.rpcCalls).toEqual([])
  })
  it.each([start, move])('does not authorize mutations when the profile check is unavailable', async route => {
    for (const kind of ['missing', 'error']) {
      fixture.profileMissing = kind === 'missing'; fixture.profileReadError = kind === 'error'
      const response = await route(request(route), params())
      expect(response.status).toBe(503); expect(await response.text()).not.toContain('private')
    }
    expect(fixture.queries.filter(q => q.write)).toEqual([]); expect(fixture.rpcCalls).toEqual([])
  })
  it.each([timeout, move])('rejects another game ID even when the caller owns a different game', async route => {
    expect((await route(bodyRequest({ ...validBody(route), gameId: 'foreign-game' }), params())).status).toBe(404)
    expect(fixture.rpcCalls).toEqual([]); expect(fixture.queries.filter(q => q.write)).toEqual([])
  })
  it.each([timeout, move])('isolates another authenticated account on the same IP', async route => {
    fixture.userId = 'second-account'
    expect((await route(request(route), params())).status).toBe(404)
    expect(fixture.limits[0].key).toContain(':second-account')
    expect(fixture.queries.find(q => q.table === 'games')?.filters).toContainEqual(['user_id', 'second-account'])
    expect(fixture.rpcCalls).toEqual([]); expect(fixture.queries.filter(q => q.write)).toEqual([])
  })
  it('uses current cancellation state even immediately after an accepted movement', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    expect((await move(request(), params())).status).toBe(200)
    const committed = fixture.rpcCalls.length
    fixture.tournament.status = 'cancelled'
    expect((await move(request(), params())).status).toBe(400)
    expect(fixture.rpcCalls).toHaveLength(committed)
  })
  it.each(routes)('%s rejects malformed JSON values before querying game data', async (_name, route) => {
    for (const body of [null, [], 'text', 7, true]) {
      expect((await route(bodyRequest(body), params())).status).toBe(400)
    }
    expect(fixture.queries).toEqual([]); expect(fixture.rpcCalls).toEqual([])
  })
  it.each([
    { gameId: {} }, { gameId: '' }, { moveNumber: 2.5 }, { moveNumber: 2 ** 31 },
    { clientTimestamp: -1 }, { clientTimestamp: 1.5 }, { clientTimestamp: Number.MAX_SAFE_INTEGER + 1 },
    { clientCurrentMoveNumber: 1.5 }, { direction: 'diagonal' },
  ])('rejects invalid movement field %j before querying data', async invalid => {
    const body = { gameId: 'closure-game', direction: 'left', moveNumber: 4, clientTimestamp: Date.now(), ...invalid }
    expect((await move(bodyRequest(body), params())).status).toBe(400)
    expect(fixture.queries).toEqual([]); expect(fixture.rpcCalls).toEqual([])
  })
  it('rejects JSON overflow rather than forwarding Infinity to SQL', async () => {
    const req = new Request('http://local.test/game', { method: 'POST',
      body: '{"gameId":"closure-game","direction":"left","moveNumber":4,"clientTimestamp":1e309}' })
    expect((await move(req, params())).status).toBe(400); expect(fixture.rpcCalls).toEqual([])
  })
  it.each([{ recoverOnly: 'false' }, { recoverOnly: true }, { gameId: 7 }])('rejects invalid recovery %j', async body => {
    expect((await start(bodyRequest(body), params())).status).toBe(400)
    expect(fixture.queries).toEqual([])
  })
  it.each(routes)('%s keeps the same account bucket across IP rotation', async (name, route) => {
    await route(request(route), params())
    await route(request(route, '203.0.113.9'), params())
    expect(fixture.limits).toHaveLength(2)
    expect(fixture.limits[0]).toEqual(fixture.limits[1])
    expect(fixture.limits[0]).toMatchObject({ key: `game:${name}:closure-user`, onError: 'deny' })
  })
  it.each([start, move])('rejects a banned account without committing a game or move', async route => {
    fixture.banned = true
    expect((await route(request(route), params())).status).toBe(403)
    expect(fixture.queries.filter(q => q.write)).toEqual([]); expect(fixture.rpcCalls).toEqual([])
  })
  it('rejects forged score, board and seed, then computes an accepted wire movement without revealing future randomness', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    const forged = await move(bodyRequest({ gameId: 'closure-game', direction: 'left', moveNumber: 4,
      clientTimestamp: Date.now(), score: 99999999, board: [[2048]], seed: 'known', clientCurrentMoveNumber: 999 }), params())
    expect(forged.status).toBe(400)
    expect(fixture.queries).toEqual([]); expect(fixture.rpcCalls).toEqual([])
    const response = await move(bodyRequest({ ...validBody(move), clientCurrentMoveNumber: 999 }), params())
    const data = await response.json()
    expect(response.status).toBe(200); expect(data.score).toBe(8)
    expect(data.nextRngStates).toEqual([]); expect(data.seed).toBeUndefined()
    expect(fixture.rpcCalls[0]?.args.p_final_score).toBe(8)
    expect(fixture.rpcCalls[0]?.args.p_board_before).toEqual(fixture.game.current_board)
  })
  it('rejects stale/replayed sequence without committing or consuming a spawn', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    expect((await move(bodyRequest({ gameId: 'closure-game', direction: 'left', moveNumber: 3,
      clientTimestamp: Date.now() }), params())).status).toBe(409)
    expect(fixture.rpcCalls).toEqual([])
  })
  it('cannot create another session at the exact tournament end', async () => {
    fixture.game.user_id = 'other-user'; fixture.tournament.play_window_end = new Date().toISOString()
    expect((await start(request(start), params())).status).toBe(400)
    expect(fixture.queries.filter(q => q.write)).toEqual([])
  })
  it('recovers the same session across tabs without resetting its clock or publishing future RNG', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    const responses = await Promise.all([start(request(start), params()), start(request(start), params())])
    for (const response of responses) expect(await response.json()).toMatchObject({
      gameId: 'closure-game', deadlineAt: '2026-10-01T16:00:45.000Z', nextRngStates: [] })
    expect(fixture.queries.filter(q => q.write)).toEqual([])
  })
})

describe.each(routes)('%s expiration persistence', (_name, route, status, flag) => {
  it('returns the score from the persisted UPDATE rather than the stale pre-move read', async () => {
    const response = await route(request(route), params()), data = await response.json()
    expect(response.status).toBe(status)
    expect(data[flag]).toBe(true); expect(data.score).toBe(16)
    expect(data.endedAt).toBe('2026-10-01T16:00:00Z')
    const writes = fixture.queries.filter(q => q.write)
    expect(writes).toHaveLength(1)
    expect(writes[0].filters).toEqual([['id','closure-game'],['tournament_id',fixture.tournament.id],['user_id','closure-user'],['status','active']])
  })
  it('does not confirm expiration on write failure or disclose database diagnostics', async () => {
    fixture.update = { data: null, error: { message: 'private_database_details' } }
    const response = await route(request(route), params()), data = await response.json()
    expect(response.status).toBe(503); expect(data.code).toBe('GAME_CLOSURE_UNCONFIRMED')
    expect(data[flag]).toBeUndefined(); expect(JSON.stringify(data)).not.toContain('private_database_details')
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it('does not turn zero rows and an active recovery read into success', async () => {
    fixture.update = { data: null, error: null }; fixture.recovery = { data: fixture.game, error: null }
    const response = await route(request(route), params())
    expect(response.status).toBe(503)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it('recovers the winner of a concurrent timeout without overwriting its score or endedAt', async () => {
    fixture.update = { data: null, error: null }
    fixture.recovery = { data: { ...fixture.game, id: 'closure-game', status: 'completed', final_score: 128,
      end_reason: 'timeout', ended_at: '2026-10-01T15:59:59Z' }, error: null }
    const response = await route(request(route), params()), data = await response.json()
    expect(response.status).toBe(status); expect(data[flag]).toBe(true)
    expect(data.score).toBe(128); expect(data.endedAt).toBe('2026-10-01T15:59:59Z')
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
    const recovery = fixture.queries.at(-1)
    expect(recovery?.filters).toEqual([['id','closure-game'],['tournament_id',fixture.tournament.id],['user_id','closure-user']])
  })
  it('does not relabel a concurrently completed no_moves game as timeout', async () => {
    fixture.update = { data: null, error: null }
    fixture.recovery = { data: { ...fixture.game, id: 'closure-game', status: 'completed', final_score: 256,
      end_reason: 'no_moves', ended_at: '2026-10-01T15:59:59Z' }, error: null }
    const response = await route(request(route), params()), data = await response.json()
    expect(data[flag]).toBe(false); expect(data.score).toBe(256)
  })
  it('does not confirm a closure when recovery fails', async () => {
    fixture.update = { data: null, error: null }; fixture.recovery = { data: null, error: { message: 'read failed' } }
    expect((await route(request(route), params())).status).toBe(503)
  })
  it('rejects another player before any write', async () => {
    fixture.game.user_id = 'other-user'
    if (_name === 'start') fixture.registered = false
    expect((await route(request(route), params())).status).toBe(_name === 'start' ? 403 : 404)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it('rejects anonymous requests before querying data', async () => {
    fixture.authenticated = false
    expect((await route(request(route), params())).status).toBe(401)
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
  const response = await timeout(request(timeout), params()), data = await response.json()
  expect(response.status).toBe(200); expect(data.timedOut).toBe(false)
  expect(data.deadlineAt).toBe('2026-10-01T16:00:45.000Z')
  expect(data.serverNow).toBe('2026-10-01T16:00:00.000Z')
  expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
})

describe('authoritative clock contract compatible with existing clients', () => {
  it('includes a clock sample when creating a game, retaining board, RNG and move fields', async () => {
    fixture.game.user_id = 'no-existing-game'
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ gameId: 'new-clock-game', resuming: false, score: 0, moveNumber: 2,
      serverNow: '2026-10-01T16:00:00.000Z', deadlineAt: '2026-10-01T16:01:00.000Z' })
    expect(data.board.flat().filter((value: number) => value > 0)).toHaveLength(2)
    expect(data.nextRngStates).toEqual([])
  })
  it('includes a clock sample when recovering a game without resetting its deadline', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ gameId: 'closure-game', resuming: true, score: 4, moveNumber: 4,
      serverNow: '2026-10-01T16:00:00.000Z', deadlineAt: '2026-10-01T16:00:45.000Z' })
    expect(data.board).toEqual(fixture.game.current_board)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it.each([true, false])('includes a clock sample for a move (moved=%s)', async moved => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    if (!moved) fixture.game.current_board = [[4,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ moved, serverNow: '2026-10-01T16:00:00.000Z', deadlineAt: '2026-10-01T16:00:45.000Z' })
    expect(data.score).toBe(moved ? 8 : 4)
    if (moved) expect(data.moveNumber).toBe(5)
    else expect(data.moveNumber).toBeUndefined()
  })
  it('uses the tournament window as the shorter authoritative deadline', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'; fixture.tournament.play_window_end = '2026-10-01T16:00:10Z'
    const response = await timeout(request(timeout), params()), data = await response.json()
    expect(data).toMatchObject({ timedOut: false, serverNow: '2026-10-01T16:00:00.000Z', deadlineAt: '2026-10-01T16:00:10.000Z' })
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
})
it('is idempotent for an already persisted timeout without writing again', async () => {
  fixture.game.status = 'completed'; fixture.game.end_reason = 'timeout'; fixture.game.final_score = 512
  const response = await timeout(request(timeout), params()), data = await response.json()
  expect(response.status).toBe(200); expect(data).toMatchObject({ timedOut: true, score: 512 })
  expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
})

describe('owned full state recovery', () => {
  it.each(routes)('%s preserves an already closed result after tournament completion', async (_name, route) => {
    fixture.game = { ...fixture.game, status: 'completed', end_reason: 'no_moves', final_score: 128,
      current_board: [[4,8,16,2],[8,16,32,64],[16,32,64,128],[32,64,128,256]], ended_at: '2026-10-01T15:59:59Z' }
    fixture.tournament.status = 'completed'; fixture.tournament.play_window_end = '2026-10-01T15:59:59Z'
    const response = await route(request(route), params()), data = await response.json()
    expect(response.status).toBe(_name === 'move' ? 400 : 200)
    expect(data).toMatchObject({ stateConfirmed: true, gameId: 'closure-game', status: 'completed', gameOver: true,
      endReason: 'no_moves', timedOut: false, score: 128, board: fixture.game.current_board, moveNumber: 4 })
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
    expect(data.seed).toBeUndefined()
  })
  it.each([start, timeout])('returns an abandoned game without calling it no_moves or creating another game', async route => {
    fixture.game = { ...fixture.game, status: 'abandoned', end_reason: 'self_ended', final_score: 32,
      ended_at: '2026-10-01T15:59:59Z' }
    const response = await route(request(route), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ status: 'abandoned', gameOver: true, endReason: 'self_ended', score: 32, timedOut: false })
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it('does not offer a fresh start when the existing-game read fails', async () => {
    fixture.readError = true
    expect((await start(request(start), params())).status).toBe(503)
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it.each(['completed','invalid','not_started'])('does not fabricate a result for incomplete %s state', async status => {
    fixture.game = { ...fixture.game, status, current_board: null, end_reason: status === 'completed' ? 'no_moves' : null }
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(503); expect(data.stateConfirmed).toBeUndefined(); expect(data.score).toBeUndefined()
    expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it('returns the entire updated board and move count from expiration RETURNING', async () => {
    const persistedBoard = [[4,8,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
    fixture.update.data = { ...(fixture.update.data as object), current_board: persistedBoard, move_count: 3 }
    const response = await timeout(request(timeout), params()), data = await response.json()
    expect(data).toMatchObject({ board: persistedBoard, moveNumber: 5, score: 16, gameOver: true, stateConfirmed: true })
  })
  it('closes an expired active game on resume after the tournament window has closed', async () => {
    fixture.tournament.status = 'completed'
    const response = await start(request(start), params()), data = await response.json()
    expect(response.status).toBe(200); expect(data).toMatchObject({ gameOver: true, score: 16, endReason: 'timeout' })
    expect(fixture.queries.filter(q => q.write)).toHaveLength(1)
  })
  it.each(['missing-game','other-player-game'])('never creates a game when recovery requests %s', async gameId => {
    fixture.game.user_id = 'other-user'
    const response = await start(new Request('http://local.test/game', { method: 'POST', body: JSON.stringify({ recoverOnly: true, gameId }) }), params())
    expect(response.status).toBe(409); expect(fixture.queries.filter(q => q.write)).toHaveLength(0)
  })
  it('returns the persisted final board and score after the last valid move', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    fixture.game.current_board = [[2,2,8,16],[8,16,32,64],[16,32,64,128],[32,64,128,256]]
    const finalBoard = [[4,8,16,2],[8,16,32,64],[16,32,64,128],[32,64,128,256]]
    fixture.finalMoveRow = { ...fixture.game, status: 'completed', end_reason: 'no_moves', final_score: 128,
      current_board: finalBoard, move_count: 3, ended_at: '2026-10-01T16:00:00Z' }
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ moved: true, stateConfirmed: true, gameOver: true, endReason: 'no_moves',
      score: 128, moveNumber: 5, board: finalBoard })
  })
  it('does not claim the locally computed final result when the persisted row is still active', async () => {
    fixture.game.started_at = '2026-10-01T15:59:45Z'
    fixture.game.current_board = [[2,2,8,16],[8,16,32,64],[16,32,64,128],[32,64,128,256]]
    const response = await move(request(), params()), data = await response.json()
    expect(response.status).toBe(503); expect(data.stateConfirmed).toBeUndefined(); expect(data.score).toBeUndefined()
  })
})
