import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const fixture = vi.hoisted(() => ({ status: 'live', profiles: [] as { id: string; username: string }[], queries: [] as { table: string;
  orders: [string, boolean][]; filters: [string, unknown][] }[] }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createAdminClient: () => ({ from: (table: string) => {
    const query = { table, orders: [] as [string, boolean][], filters: [] as [string, unknown][] }
    const run = async () => { fixture.queries.push(query); return { data: table === 'tournaments'
      ? { id: 'tournament', status: fixture.status, name: 'Test', game_type: '2048_score' }
      : table === 'profiles' ? fixture.profiles : [], error: null } }
    const q = { select: () => q, eq: (key: string, value: unknown) => { query.filters.push([key, value]); return q },
      in: (key: string, value: unknown) => { query.filters.push([key, value]); return q },
      order: (key: string, options: { ascending: boolean }) => { query.orders.push([key, options.ascending]); return q },
      limit: () => q, single: run, maybeSingle: run, then: (resolve: (value: unknown) => unknown) => run().then(resolve) }
    return q
  } }),
}))
import Leaderboard from '@/app/(public)/tournaments/[id]/leaderboard/page'
import Audit from '@/app/(public)/tournaments/[id]/audit/page'

beforeEach(() => { fixture.status = 'live'; fixture.profiles = []; fixture.queries = [] })
const params = () => ({ params: Promise.resolve({ id: 'tournament' }) })
describe('ranking agrees with the authoritative finalizer', () => {
  // Derive the contract from deployed migration source, not a duplicate sorter.
  const sql = readFileSync('supabase/migrations/20260805163009_fixed_prize_business_model.sql', 'utf8')
  const order = sql.match(/ORDER BY final_score DESC, highest_tile DESC, move_count ASC, user_id ASC/)![0]
    .replace('ORDER BY ', '').split(', ').map(part => { const [column, direction] = part.split(' '); return [column, direction === 'ASC'] })
  it.each([['leaderboard', Leaderboard], ['audit', Audit]] as const)('%s uses every SQL tie-break key in order', async (_name, page) => {
    await page(params())
    expect(fixture.queries.find(q => q.table === 'games')?.orders).toEqual(order)
  })
  it('excludes invalid/abandoned sessions from the provisional ranking', async () => {
    await Leaderboard(params())
    expect(fixture.queries.find(q => q.table === 'games')?.filters).toContainEqual(['status', ['completed', 'active']])
  })
  it('uses persisted rank when the tournament is completed', async () => {
    fixture.status = 'completed'; await Leaderboard(params())
    expect(fixture.queries.some(q => q.table === 'games')).toBe(false)
    expect(fixture.queries.find(q => q.table === 'tournament_results')?.orders).toEqual([['rank', true]])
  })
})
