import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tournament } from '@/types/database'
import { COMMUNITY_FREE_CONFIG } from '@/lib/tournament/community-free'
import { buildPlayer2048RetentionReport } from '@/lib/game/player-2048-retention'

vi.mock('server-only', () => ({}))
import { get2048TrialServerSnapshot, type Trial2048ReportClient } from '@/lib/analytics/2048-trial-server'

const range = { from: '2026-10-01', to: '2026-10-03' }
const emptyRetention = () => buildPlayer2048RetentionReport([], range.from, range.to, '2026-10-19')
const tournament = (id: string, date: string): Tournament => ({ ...COMMUNITY_FREE_CONFIG, id, name: `Reto ${id}`,
  description: null, status: 'completed', created_by: 'private-admin', created_at: date,
  registration_opens_at: new Date(Date.parse(date) - 60_000).toISOString(), play_window_start: date,
  play_window_end: new Date(Date.parse(date) + 86_400_000).toISOString() })
type QueryResult = { data: unknown; error: unknown; count?: number | null }
function fixture() {
  const results: Record<string, QueryResult> = {
    tournaments: { data: [], error: null }, registrations: { data: [], error: null, count: 0 }, games: { data: [], error: null, count: 0 },
  }
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const rpc = vi.fn(async () => ({ data: emptyRetention() as unknown, error: null as unknown }))
  const from = vi.fn((table: string) => {
    const query = {
      select(...args: unknown[]) { calls.push({ table, method: 'select', args }); return query },
      eq(...args: unknown[]) { calls.push({ table, method: 'eq', args }); return query },
      in(...args: unknown[]) { calls.push({ table, method: 'in', args }); return query },
      order(...args: unknown[]) { calls.push({ table, method: 'order', args }); return query },
      limit(...args: unknown[]) { calls.push({ table, method: 'limit', args }); return query },
      then(resolve: (value: QueryResult) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(results[table]).then(resolve, reject) },
    }
    return query
  })
  return { db: { rpc, from } as unknown as Trial2048ReportClient, rpc, from, results, calls }
}
afterEach(() => vi.useRealTimers())

describe('server 2048 trial read model', () => {
  it('keeps confirmed empty aggregates distinct from unavailable sources and empty denominators null', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-19T15:30:00.000Z')
    const f = fixture(), snapshot = await get2048TrialServerSnapshot(f.db, range)
    expect(snapshot).toMatchObject({ version: 1, loadedAt: '2026-10-19T15:30:00.000Z', timezone: 'America/Santiago',
      range: { ...range, days: 3 }, retention: { status: 'ready', report: { totals: { accounts: 0,
        day1: { eligibleAccounts: 0, returnedAccounts: 0, rate: null }, day7: { eligibleAccounts: 0, returnedAccounts: 0, rate: null } } } },
      community: { status: 'ready', report: { events: [], unit: 'account_participations', maxEvents: 30 } } })
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('report_2048_player_retention', { p_from: range.from, p_to: range.to })
    expect(f.from).toHaveBeenCalledExactlyOnceWith('tournaments')
  })

  it('retains source-calculated mature D7 denominators, exact returns, and pending target days', async () => {
    const f = fixture()
    f.rpc.mockResolvedValue({ error: null, data: buildPlayer2048RetentionReport([
      { userId: 'private-A', activityDay: '2026-10-01', practice: true, daily: false },
      { userId: 'private-A', activityDay: '2026-10-08', practice: false, daily: true },
      { userId: 'private-B', activityDay: '2026-10-02', practice: true, daily: false },
    ], range.from, range.to, '2026-10-09') })
    const snapshot = await get2048TrialServerSnapshot(f.db, range)
    expect(snapshot.retention.status).toBe('ready')
    expect(snapshot.retention.report?.totals.day7).toEqual({ eligibleAccounts: 1, returnedAccounts: 1, rate: 1 })
    expect(snapshot.retention.report?.cohorts[1].day7).toEqual({ eligibleAccounts: 0, returnedAccounts: 0, rate: null })
    expect(snapshot.retention.report?.asOfChileDay).toBe('2026-10-09')
    expect(JSON.stringify(snapshot)).not.toContain('private-A')
  })

  it('preserves community latest-event scope independently of the retention cohort dates and does not output person IDs', async () => {
    const f = fixture(), a = tournament('public-A', '2026-09-10T12:00:00Z'), b = tournament('public-B', '2026-10-21T12:00:00Z')
    f.results.tournaments.data = [b, a]
    f.results.registrations = { error: null, count: 2, data: [
      { tournament_id: a.id, user_id: 'private-player' }, { tournament_id: b.id, user_id: 'private-player' },
    ] }
    f.results.games = { error: null, count: 2, data: [a, b].map(event => ({ tournament_id: event.id,
      user_id: 'private-player', status: 'completed', started_at: event.play_window_start, move_count: 1 })) }
    const snapshot = await get2048TrialServerSnapshot(f.db, range)
    expect(snapshot.scopes).toEqual({ retention: 'first_known_activity_cohorts_in_range', community: 'latest_30_community_events_without_date_filter' })
    expect(snapshot.community.report?.events).toHaveLength(2) // Both events are outside the retention range.
    expect(snapshot.community.report?.events[1].returnToNext).toEqual({ eligibleAccounts: 1, returnedAccounts: 1, rate: 1 })
    expect(f.calls.some(call => ['gte', 'lte', 'gt', 'lt'].includes(call.method))).toBe(false)
    expect(f.calls).toContainEqual({ table: 'tournaments', method: 'limit', args: [30] })
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toMatch(/private-player|private-admin|user_id|userId|email|current_board|access_token/)
    expect(JSON.parse(serialized)).toEqual(snapshot)
  })

  it.each(['rpc_error', 'rpc_throw', 'malformed', 'wrong_range', 'premature_d7'] as const)('keeps community ready when retention is %s, without fabricated retention zeroes or private errors', async failure => {
    const f = fixture()
    if (failure === 'rpc_throw') f.rpc.mockRejectedValue(new Error('private error details'))
    else if (failure === 'rpc_error') f.rpc.mockResolvedValue({ data: null, error: { message: 'private SQL' } })
    else if (failure === 'malformed') f.rpc.mockResolvedValue({ data: { ...emptyRetention(), totals: { accounts: 99 } }, error: null })
    else if (failure === 'wrong_range') f.rpc.mockResolvedValue({ data: buildPlayer2048RetentionReport([], '2026-10-01', '2026-10-02', '2026-10-19'), error: null })
    else {
      const report = buildPlayer2048RetentionReport([{ userId: 'private-player', activityDay: range.from, practice: true, daily: false }], range.from, range.to, '2026-10-08')
      report.cohorts[0].day7 = { eligibleAccounts: 1, returnedAccounts: 0, rate: 0 }
      f.rpc.mockResolvedValue({ data: report, error: null })
    }
    const snapshot = await get2048TrialServerSnapshot(f.db, range)
    expect(snapshot.retention).toEqual({ status: 'unavailable', report: null })
    expect(snapshot.community.status).toBe('ready')
    expect(JSON.stringify(snapshot)).not.toMatch(/private SQL|private error|private-player/)
  })

  it.each(['query_error', 'query_throw', 'partial_rows', 'missing_count', 'invalid_game'] as const)('keeps retention ready when community has %s and never publishes a partial empty report', async failure => {
    const f = fixture(), a = tournament('public-A', '2026-10-01T12:00:00Z')
    f.results.tournaments.data = [a]
    if (failure === 'query_error') f.results.tournaments = { data: null, error: { message: 'private query' } }
    else if (failure === 'query_throw') f.from.mockImplementation(() => { throw new Error('private SQL throw') })
    else if (failure === 'partial_rows') f.results.registrations = { error: null, data: [], count: 1 }
    else if (failure === 'missing_count') f.results.games = { error: null, data: [] }
    else {
      f.results.registrations = { error: null, count: 1, data: [{ tournament_id: a.id, user_id: 'private-player' }] }
      f.results.games = { error: null, count: 1, data: [{ tournament_id: a.id, user_id: 'private-player', status: 'active', started_at: null, move_count: 1 }] }
    }
    const snapshot = await get2048TrialServerSnapshot(f.db, range)
    expect(snapshot.retention.status).toBe('ready')
    expect(snapshot.community).toEqual({ status: 'unavailable', report: null })
    expect(JSON.stringify(snapshot)).not.toMatch(/private query|private SQL|private-player/)
  })

  it('keeps simultaneous failures unavailable independently', async () => {
    const f = fixture()
    f.rpc.mockRejectedValue(new Error('private RPC failure'))
    f.results.tournaments = { data: null, error: { message: 'private query failure' } }
    const snapshot = await get2048TrialServerSnapshot(f.db, range)
    expect(snapshot.retention).toEqual({ status: 'unavailable', report: null })
    expect(snapshot.community).toEqual({ status: 'unavailable', report: null })
  })

  it('starts both existing readers concurrently instead of waiting for retention before community', async () => {
    const f = fixture()
    let resolve!: (value: { data: unknown; error: unknown }) => void
    f.rpc.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = get2048TrialServerSnapshot(f.db, range)
    await Promise.resolve()
    expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.from).toHaveBeenCalledWith('tournaments')
    resolve({ data: emptyRetention(), error: null })
    expect((await pending).community.status).toBe('ready')
  })

  it.each([
    { from: null, to: range.to }, { from: ['2026-10-01'], to: range.to }, { from: range.to, to: range.from },
    { from: '2026-02-29', to: '2026-03-01' }, { from: '2026-01-01', to: '2026-04-01' },
    { from: '2026-10-01T00:00:00Z', to: range.to },
  ])('rejects invalid or over-90-day ranges before any privileged reads: %j', async invalid => {
    const f = fixture()
    await expect(get2048TrialServerSnapshot(f.db, invalid)).rejects.toThrow('TRIAL_2048_INVALID_RANGE')
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled()
  })
})
