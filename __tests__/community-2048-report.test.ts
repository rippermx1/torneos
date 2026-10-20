import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tournament } from '@/types/database'
import { COMMUNITY_FREE_CONFIG } from '@/lib/tournament/community-free'
import { buildCommunity2048Report, readCommunity2048Report } from '@/lib/analytics/2048-community'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.db }))
import { GET } from '@/app/api/admin/reports/2048-community/route'

const event = (id: string, start: string, status: Tournament['status'] = 'completed'): Tournament => ({
  ...COMMUNITY_FREE_CONFIG, id, name: `Reto ${id}`, description: null, status, created_by: 'operator', created_at: start,
  registration_opens_at: new Date(Date.parse(start) - 60_000).toISOString(), play_window_start: start,
  play_window_end: new Date(Date.parse(start) + 86_400_000).toISOString(),
})
const a = event('a', '2026-10-14T12:00:00Z'), b = event('b', '2026-10-21T12:00:00Z')
const registration = (tournament_id: string, user_id: string) => ({ tournament_id, user_id })
const game = (tournament_id: string, user_id: string, move_count = 1, status = 'completed') => ({
  tournament_id, user_id, status, move_count, started_at: '2026-10-21T12:00:00Z',
})

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, access: { userId: 'operator' } }) })

describe('community report derives account participation from authoritative rows', () => {
  it('deduplicates counts and measures intersection only across two official noncancelled events', () => {
    const registrations = [registration('a', 'private-A'), registration('a', 'private-B'), registration('b', 'private-A'), registration('b', 'private-C')]
    const games = [game('a', 'private-A'), game('a', 'private-B'), game('b', 'private-A'), game('b', 'private-C', 0)]
    const report = buildCommunity2048Report([b, a], [...registrations, registrations[0]], [...games, games[0]])
    expect(report.events[1]).toMatchObject({ tournamentId: 'a', registrations: 2, starts: 2, firstMoves: 2, completed: 2,
      nextTournamentId: 'b', returnToNext: { eligibleAccounts: 2, returnedAccounts: 1, rate: 0.5 } })
    expect(report.events[0]).toMatchObject({ tournamentId: 'b', registrations: 2, starts: 2, firstMoves: 1, completed: 2, returnToNext: null })
    const json = JSON.stringify(report)
    expect(json).not.toContain('private-A'); expect(json).not.toContain('user_id'); expect(json).not.toContain('operator')
    expect(json).not.toContain('email'); expect(json).not.toContain('current_board')
  })
  it.each(['scheduled', 'open', 'live', 'finalizing'] as const)('keeps return unknown when the next event is %s', status => {
    const report = buildCommunity2048Report([a, { ...b, status }], [registration('a', 'u')], [game('a', 'u')])
    expect(report.events.find(row => row.tournamentId === 'a')?.returnToNext).toBeNull()
  })
  it('does not treat a canceled event as a missed return opportunity', () => {
    const cancelled = event('cancelled', '2026-10-18T12:00:00Z', 'cancelled')
    const report = buildCommunity2048Report([a, cancelled, b], [registration('a', 'u'), registration('b', 'u')], [game('a', 'u'), game('b', 'u')])
    expect(report.events.find(row => row.tournamentId === 'a')).toMatchObject({ nextTournamentId: 'b', returnToNext: { eligibleAccounts: 1, returnedAccounts: 1, rate: 1 } })
    expect(report.events.find(row => row.tournamentId === 'cancelled')?.returnToNext).toBeNull()
  })
  it('does not invent a rate for a closed cohort without first moves', () => {
    const report = buildCommunity2048Report([a, b], [registration('a', 'u')], [game('a', 'u', 0)])
    expect(report.events[1].returnToNext).toEqual({ eligibleAccounts: 0, returnedAccounts: 0, rate: null })
  })
  it('excludes test/paid formats and invalid/unregistered games from valid participation', () => {
    const report = buildCommunity2048Report([a, { ...b, is_test: true }, { ...b, id: 'paid', preset_key: 'commercial_v1' }],
      [registration('a', 'u')], [game('a', 'u', 1, 'invalid'), game('a', 'orphan')])
    expect(report.events).toHaveLength(1); expect(report.events[0]).toMatchObject({ registrations: 1, starts: 0, firstMoves: 0, completed: 0 })
  })
  it('fails rather than publishing partial or malformed data as zero', () => {
    expect(() => buildCommunity2048Report([a], Array.from({ length: 451 }, () => registration('a', 'u')), [])).toThrow()
    expect(() => buildCommunity2048Report([{ ...a, prize_1st_cents: 100 }], [], [])).toThrow()
    expect(() => buildCommunity2048Report([a], [registration('a', 'u')], [{ ...game('a', 'u'), started_at: null }])).toThrow()
  })
  it('detects row clipping even when the selected array fits the limit', async () => {
    const db = { from: (table: string) => {
      const query = { select() { return query }, eq() { return query }, in() { return query }, order() { return query }, limit() { return query },
        then(resolve: (result: unknown) => unknown) { return Promise.resolve({ error: null,
          data: table === 'tournaments' ? [a] : [], count: table === 'registrations' ? 451 : 0 }).then(resolve) } }
      return query
    } }
    await expect(readCommunity2048Report(db as unknown as Parameters<typeof readCommunity2048Report>[0])).rejects.toThrow('COMMUNITY_REPORT_INCOMPLETE')
  })
})

describe('community report API', () => {
  it.each([401, 403])('preserves guest/player/AAL1 denial %s before reading any data', async status => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status }) })
    expect((await GET(new Request('https://torneos-dev.vercel.app/api/admin/reports/2048-community'))).status).toBe(status)
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('rejects client-selected cohort dates or identities', async () => {
    expect((await GET(new Request('https://torneos-dev.vercel.app/api/admin/reports/2048-community?asOf=2030-01-01'))).status).toBe(400)
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('returns unavailable on a database failure, never a fabricated empty report', async () => {
    mocks.db.mockImplementation(() => { throw new Error('private account detail') })
    const response = await GET(new Request('https://torneos-dev.vercel.app/api/admin/reports/2048-community'))
    expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.text()).not.toContain('private account detail')
  })
})
