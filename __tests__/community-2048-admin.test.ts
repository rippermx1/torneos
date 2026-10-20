import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), writes: [] as Array<Record<string, unknown>>, activeFreerolls: 0,
}))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: state.auth }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://torneos-dev.vercel.app' }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: state.rate,
  rateLimitResponse: () => Response.json({}, { status: 503 }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({
  from() {
    let inserted = false
    const query = {
      insert(value: Record<string, unknown>) { state.writes.push(value); inserted = true; return query },
      select() { return query }, eq() { return query }, in() { return query }, gte() { return query },
      single: async () => ({ data: { id: '33333333-3333-4333-8333-333333333333' }, error: null }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: inserted ? {} : [], error: null, count: state.activeFreerolls }).then(resolve) },
    }
    return query
  },
}) }))

import { POST } from '@/app/api/admin/tournaments/route'
import { createGovernedTournament } from '@/lib/tournament/create-tournament'

const now = Date.parse('2026-10-16T15:00:00Z')
const payload = () => ({ name: 'Reto comunitario', description: 'Sin premio', presetKey: 'community_free_v1', skillTier: null,
  registrationOpensAt: new Date(now - 60_000).toISOString(), playWindowStart: new Date(now + 30_000).toISOString(),
  playWindowEnd: new Date(now + 30_000 + 86_400_000).toISOString() })
const request = (body: unknown = payload(), origin = 'https://torneos-dev.vercel.app', headers: Record<string, string> = {}) => new Request(
  'http://localhost:3000/api/admin/tournaments', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks(); state.writes = []; state.activeFreerolls = 0
  state.auth.mockResolvedValue({ ok: true, access: { userId: 'operator' } })
  state.rate.mockResolvedValue({ ok: true })
})
afterEach(() => vi.useRealTimers())

describe('administrative community creation is the ordinary protected server contract', () => {
  it('persists server-owned zero-value fields and canonical 24-hour dates', async () => {
    const response = await POST(request())
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ ok: true })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0]).toMatchObject({ created_by: 'operator', preset_key: 'community_free_v1', business_rule_version: 4,
      is_test: false, skill_tier: null, game_type: '2048_score', tournament_type: 'freeroll', entry_fee_cents: 0,
      prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0, min_players: 2, max_players: 15,
      max_game_duration_seconds: 300, status: 'scheduled', play_window_end: payload().playWindowEnd })
  })
  it.each([401, 403])('preserves role/MFA denial %s before privileged writes', async status => {
    state.auth.mockResolvedValue({ ok: false, response: Response.json({ mfaRequired: true }, { status }) })
    expect((await POST(request())).status).toBe(status); expect(state.writes).toEqual([])
  })
  it.each(['https://other.example', 'https://torneos-dev.vercel.app.evil.example'])('rejects a cross-origin operator request', async origin => {
    expect((await POST(request(payload(), origin))).status).toBe(403)
    expect(state.auth).not.toHaveBeenCalled(); expect(state.writes).toEqual([])
  })
  it.each([
    { entryFeeCents: 1 }, { prize1Cents: 1 }, { isTest: true }, { gameType: 'snake_arena' },
    { presetKey: 'internal_test_v1' }, { presetKey: 'freeroll_v1' }, { skillTier: 'novato' },
  ])('rejects monetary, historical-test and other-game substitutions: %j', async patch => {
    expect((await POST(request({ ...payload(), ...patch }))).status).toBe(400)
    expect(state.writes).toEqual([])
  })
  it('rejects a shortened window and a start that is no longer in the future', async () => {
    expect((await POST(request({ ...payload(), playWindowEnd: new Date(now + 390_000).toISOString() }))).status).toBe(400)
    const start = new Date(now).toISOString(), end = new Date(now + 86_400_000).toISOString()
    expect((await POST(request({ ...payload(), playWindowStart: start, playWindowEnd: end }))).status).toBe(400)
    expect(state.writes).toEqual([])
  })
  it('bounds the actual streamed body even without a declared content-length', async () => {
    expect((await POST(request({ ...payload(), description: 'x'.repeat(5000) }))).status).toBe(413)
    expect(state.writes).toEqual([])
  })
  it('does not create when the distributed write limit is unavailable', async () => {
    state.rate.mockResolvedValue({ ok: false })
    expect((await POST(request())).status).toBe(503); expect(state.writes).toEqual([])
  })
  it.each(['commercial_v1', 'freeroll_v1', 'internal_test_v1', 'unknown'])('rejects forged Server Action preset %s before creating an obligation', async presetKey => {
    await expect(createGovernedTournament({ ...payload(), presetKey }, 'operator')).rejects.toThrow(/sólo permite retos comunitarios gratuitos y sin premios/)
    expect(state.writes).toEqual([])
  })
})
