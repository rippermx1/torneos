import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: '11111111-1111-4111-8111-111111111111',
  denied: 0,
  emailConfirmed: true,
  profile: {} as Record<string, unknown> | null,
  tournament: {} as Record<string, unknown>,
  registered: true,
  game: null as Record<string, unknown> | null,
  rpcError: null as { code?: string; message: string } | null,
  insertStartedAt: null as string | null,
  insertError: null as { code: string; message: string } | null,
  writes: [] as Array<{ table: string; value: Record<string, unknown> }>,
  rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })), getRequestIp: () => '127.0.0.1',
  rateLimitResponse: () => Response.json({}, { status: 429 }),
}))
vi.mock('@/lib/supabase/auth', () => ({ requireAnyRoleForApi: vi.fn(async () => state.denied
  ? { ok: false, response: Response.json({}, { status: state.denied }) }
  : { ok: true, access: { userId: state.userId, isAdmin: false,
    user: { email_confirmed_at: state.emailConfirmed ? '2026-10-16T14:00:00Z' : null } } }) }))
vi.mock('@/lib/email/tournament-notifications', () => ({ sendTournamentRegistrationEmail: vi.fn() }))
vi.mock('@/lib/anticheat/detector', () => ({ analyzeMove: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({
  from(table: string) {
    let value: Record<string, unknown> | undefined
    let insert = false
    const filters = new Map<string, unknown>()
    const query = {
      select() { return query }, eq(key: string, expected: unknown) { filters.set(key, expected); return query },
      in() { return query }, maybeSingle() { return Promise.resolve(result()) }, single() { return Promise.resolve(result()) },
      insert(next: Record<string, unknown>) { value = next; insert = true; return query },
      update(next: Record<string, unknown>) { value = next; return query },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    function result() {
      if (value) {
        state.writes.push({ table, value })
        if (table === 'games') {
          if (insert && state.insertError) return { data: null, error: state.insertError, count: null }
          if (insert) state.game = { ...value, started_at: state.insertStartedAt ?? value.started_at,
            id: '22222222-2222-4222-8222-222222222222', end_reason: null, ended_at: null }
          else if (state.game && (!filters.has('status') || state.game.status === filters.get('status'))) Object.assign(state.game, value)
        }
        if (table === 'tournaments') Object.assign(state.tournament, value)
      }
      const data = table === 'profiles' ? state.profile : table === 'tournaments' ? state.tournament
        : table === 'registrations' ? state.registered ? { id: 'registration' } : null : table === 'games' ? state.game : null
      return { data, error: null, count: state.registered ? 2 : 0 }
    }
    return query
  },
  async rpc(name: string, args: Record<string, unknown>) {
    state.rpcs.push({ name, args })
    if (name === 'record_game_move' && state.game) Object.assign(state.game, {
      final_score: args.p_final_score, move_count: args.p_move_count, current_board: args.p_current_board,
      status: args.p_status ?? 'active', end_reason: args.p_end_reason, ended_at: args.p_ended_at,
    })
    return { data: null, error: state.rpcError }
  },
}) }))

import { POST as register } from '@/app/api/tournaments/[id]/register/route'
import { POST as start } from '@/app/api/tournaments/[id]/game/start/route'
import { POST as move } from '@/app/api/tournaments/[id]/game/move/route'
import { POST as timeout } from '@/app/api/tournaments/[id]/game/timeout/route'
import { CURRENT_TERMS_VERSION } from '@/lib/legal/terms'

const now = Date.parse('2026-10-16T15:00:00Z')
const context = { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) }
const request = (body: unknown = {}) => new Request('https://torneos-dev.vercel.app/api/tournaments/fixture', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const activeGame = () => ({ id: '22222222-2222-4222-8222-222222222222', user_id: state.userId,
  tournament_id: '33333333-3333-4333-8333-333333333333', status: 'active', seed: 123,
  current_board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  final_score: 0, move_count: 0, started_at: new Date(now - 100_000).toISOString(), end_reason: null, ended_at: null })

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  state.denied = 0; state.registered = true; state.game = null; state.rpcError = null
  state.emailConfirmed = true
  state.insertStartedAt = null; state.insertError = null
  state.writes = []; state.rpcs = []
  state.profile = { is_banned: false, birth_date: '1994-01-01', terms_version: CURRENT_TERMS_VERSION,
    terms_accepted_at: new Date(now - 1000).toISOString(), kyc_status: 'not_started' }
  state.tournament = { id: '33333333-3333-4333-8333-333333333333', name: 'QA community', status: 'open',
    game_type: '2048_score', tournament_type: 'freeroll', preset_key: 'community_free_v1', business_rule_version: 4, is_test: false, prize_model: 'fixed',
    entry_fee_cents: 0, prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0, min_players: 2,
    max_players: 15, max_game_duration_seconds: 300, skill_tier: null, prize_fund_bps: 5500,
    platform_fee_bps: 4500, prize_1st_bps: 7500, prize_2nd_bps: 2500, prize_3rd_bps: 0,
    registration_opens_at: new Date(now - 60_000).toISOString(), play_window_start: new Date(now + 60_000).toISOString(),
    play_window_end: new Date(now + 86_460_000).toISOString() }
})
afterEach(() => vi.useRealTimers())

describe('community registration uses existing account requirements and no checkout', () => {
  it('registers an adult with current terms without monetary KYC or a skill division', async () => {
    expect((await register(request(), context)).status).toBe(200)
    expect(state.rpcs).toEqual([{ name: 'register_for_tournament', args: {
      p_user_id: state.userId, p_tournament_id: state.tournament.id, p_entry_fee_cents: 0,
    } }])
    expect(state.writes).toEqual([])
  })
  it.each([401, 403])('preserves the Auth/email/role guard result %s', async denied => {
    state.denied = denied
    expect((await register(request(), context)).status).toBe(denied)
    expect(state.rpcs).toEqual([])
  })
  it('requires confirmed email even when a role guard returns an access object', async () => {
    state.emailConfirmed = false
    expect((await register(request(), context)).status).toBe(403)
    expect(state.rpcs).toEqual([])
  })
  it.each([
    { is_banned: true }, { birth_date: null }, { birth_date: '2012-01-01' },
    { terms_version: 'obsolete' }, { terms_accepted_at: null },
  ])('does not register an ineligible profile: %j', async patch => {
    Object.assign(state.profile!, patch)
    expect((await register(request(), context)).status).toBe(403)
    expect(state.rpcs).toEqual([])
  })
  it('closes registration exactly at the play start', async () => {
    state.tournament.play_window_start = new Date(now).toISOString()
    expect((await register(request(), context)).status).toBe(400)
    expect(state.rpcs).toEqual([])
  })
  it.each([
    [{ code: '23505', message: 'duplicate' }, 409], [{ message: 'Torneo lleno' }, 400],
  ] as const)('reports the atomic duplicate/capacity rejection without a second attempt', async (error, status) => {
    state.rpcError = error
    expect((await register(request(), context)).status).toBe(status)
    expect(state.rpcs).toHaveLength(1)
  })
  it('keeps paid direct registration behind checkout', async () => {
    state.tournament.entry_fee_cents = 500_000
    const response = await register(request(), context)
    expect(response.status).toBe(402); expect(await response.json()).toMatchObject({ paymentRequired: true })
    expect(state.rpcs).toEqual([])
  })
})

describe('community attempts preserve five minutes and the authoritative result', () => {
  beforeEach(() => { state.tournament.status = 'live'; state.tournament.play_window_start = new Date(now - 60_000).toISOString() })
  it('does not create an attempt for an unregistered player', async () => {
    state.registered = false
    expect((await start(request(), context)).status).toBe(403)
    expect(state.writes).toEqual([])
  })
  it('allows the last complete 300-second start', async () => {
    state.tournament.play_window_end = new Date(now + 300_000).toISOString()
    state.tournament.play_window_start = new Date(now + 300_000 - 86_400_000).toISOString()
    state.tournament.registration_opens_at = new Date(now - 86_400_000).toISOString()
    const response = await start(request(), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ deadlineAt: new Date(now + 300_000).toISOString(), score: 0 })
    expect(state.writes.filter(write => write.table === 'games')).toHaveLength(1)
  })
  it('rejects a new attempt one millisecond after the last complete start', async () => {
    state.tournament.play_window_end = new Date(now + 299_999).toISOString()
    state.tournament.play_window_start = new Date(now + 299_999 - 86_400_000).toISOString()
    state.tournament.registration_opens_at = new Date(now - 86_400_000).toISOString()
    expect((await start(request(), context)).status).toBe(400)
    expect(state.writes).toEqual([])
  })
  it('uses the persisted DB start for the deadline rather than an earlier API timestamp', async () => {
    state.insertStartedAt = new Date(now + 25).toISOString()
    const response = await start(request(), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ deadlineAt: new Date(now + 300_025).toISOString() })
  })
  it('handles the DB last-start rejection if time expired while waiting for the write', async () => {
    state.insertError = { code: 'PT409', message: 'COMMUNITY_LAST_START_PASSED' }
    expect((await start(request(), context)).status).toBe(400)
    expect(state.game).toBeNull()
  })
  it('recovers the same attempt after the new-start cutoff without extending its deadline', async () => {
    state.game = activeGame(); state.tournament.play_window_end = new Date(now + 299_999).toISOString()
    state.tournament.play_window_start = new Date(now + 299_999 - 86_400_000).toISOString()
    state.tournament.registration_opens_at = new Date(now - 86_400_000).toISOString()
    const original = structuredClone(state.game)
    const response = await start(request({ recoverOnly: true, gameId: state.game.id }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ gameId: original.id, resuming: true,
      deadlineAt: new Date(now + 200_000).toISOString(), score: 0 })
    expect(state.game).toEqual(original); expect(state.writes).toEqual([])
  })
  it('returns an existing closed result instead of giving a second attempt', async () => {
    state.game = { ...activeGame(), status: 'completed', final_score: 128, end_reason: 'timeout', ended_at: new Date(now).toISOString() }
    const original = structuredClone(state.game)
    const response = await start(request(), context)
    expect(await response.json()).toMatchObject({ gameId: original.id, score: 128, status: 'completed' })
    expect(state.writes).toEqual([])
  })
  it('rejects a client score instead of accepting or silently using it', async () => {
    state.game = activeGame()
    const response = await move(request({ gameId: state.game.id, direction: 'left', moveNumber: 2,
      clientTimestamp: now, score: 9_999_999 }), context)
    expect(response.status).toBe(400); expect(state.rpcs).toEqual([])
    expect(state.game.final_score).toBe(0)
  })
  it('derives score from a legal direction and does not publish a future RNG stream', async () => {
    state.game = activeGame()
    const response = await move(request({ gameId: state.game.id, direction: 'left', moveNumber: 2, clientTimestamp: now }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ moved: true, score: 4, nextRngStates: [] })
    expect(state.rpcs[0]).toMatchObject({ name: 'record_game_move', args: { p_final_score: 4, p_score_gained: 4 } })
  })
  it('does not persist a no-op as a valid move', async () => {
    state.game = { ...activeGame(), current_board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }
    const response = await move(request({ gameId: state.game.id, direction: 'left', moveNumber: 2, clientTimestamp: now }), context)
    expect(await response.json()).toMatchObject({ moved: false, score: 0 })
    expect(state.rpcs).toEqual([]); expect(state.game.move_count).toBe(0)
  })
  it('does not close early, then persists timeout at the exact original deadline', async () => {
    state.game = activeGame()
    expect((await timeout(request({ gameId: state.game.id }), context)).status).toBe(200)
    expect(state.writes).toEqual([])
    vi.setSystemTime(now + 200_000)
    const response = await timeout(request({ gameId: state.game.id }), context)
    expect(await response.json()).toMatchObject({ status: 'completed', endReason: 'timeout', timedOut: true, score: 0 })
    expect(state.writes).toHaveLength(1)
    const closed = structuredClone(state.game)
    await timeout(request({ gameId: state.game!.id }), context)
    expect(state.game).toEqual(closed); expect(state.writes).toHaveLength(1)
  })
})
