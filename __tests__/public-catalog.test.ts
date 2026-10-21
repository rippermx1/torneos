import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => mocks)
import { getPublicTournaments } from '@/lib/tournament/public-catalog'

const id = '10000000-0000-0000-0000-000000000001'
const row = { id, name: 'Tournament', game_type: '2048_score', status: 'open', max_players: 15,
  preset_key: 'community_free_v1', business_rule_version: 4, entry_fee_cents: 0,
  prize_1st_cents: 0, prize_2nd_cents: 0, prize_3rd_cents: 0,
  registration_opens_at: '2020-01-01T00:00:00Z', play_window_start: '2090-01-01T00:00:00Z', play_window_end: '2090-01-02T00:00:00Z' }

describe('public catalogue data contract', () => {
  let requests: URL[]
  let mode: 'ok' | 'empty' | 'catalog-error' | 'count-error' | 'missing-count' | 'missing-key'
  let rows: Record<string, unknown>[]
  beforeEach(() => {
    vi.clearAllMocks()
    requests = []
    mode = 'ok'
    rows = [row]
    const client = createSupabaseClient('http://127.0.0.1:59999', 'fixture-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input))
        requests.push(url)
        const isCount = url.searchParams.get('select') === 'id,registrations(count)'
        if (mode === 'catalog-error' || (mode === 'count-error' && isCount)) {
          return Response.json({ message: 'Unavailable' }, { status: 400 })
        }
        return Response.json(isCount
          ? mode === 'missing-count' ? [] : [{ id, registrations: [{ count: 12 }] }]
          : mode === 'empty' ? [] : rows)
      } },
    })
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockImplementation(() => {
      if (mode === 'missing-key') throw new Error('Missing service key')
      return client
    })
  })

  it('uses real PostgREST serialization and returns only public fields and an aggregate', async () => {
    const result = await getPublicTournaments()
    expect(result.error).toBe(false)
    expect(result.tournaments[0].registeredCount).toBe(12)
    expect(requests).toHaveLength(2)
    expect(requests[0].searchParams.get('is_test')).toBe('eq.false')
    expect(requests[0].searchParams.get('game_type')).toBe('eq.2048_score')
    expect(requests[0].searchParams.get('preset_key')).toBe('eq.community_free_v1')
    expect(requests[0].searchParams.get('business_rule_version')).toBe('eq.4')
    for (const column of ['entry_fee_cents', 'prize_1st_cents', 'prize_2nd_cents', 'prize_3rd_cents']) {
      expect(requests[0].searchParams.get(column)).toBe('eq.0')
    }
    expect(requests[0].searchParams.get('select')).not.toContain('*')
    expect(requests[1].searchParams.get('select')).toBe('id,registrations(count)')
    expect(requests[1].searchParams.get('id')).toContain(id)
    expect(result.tournaments[0]).not.toHaveProperty('registrations')
  })

  it.each(['count-error', 'missing-count', 'missing-key'] as const)('shows unknown counts for %s while preserving tournaments', async (failure) => {
    mode = failure
    const result = await getPublicTournaments()
    expect(result.error).toBe(false)
    expect(result.tournaments[0].registeredCount).toBeNull()
  })

  it('distinguishes an empty catalogue from a query failure', async () => {
    mode = 'empty'
    expect(await getPublicTournaments()).toMatchObject({ tournaments: [], error: false })
    mode = 'catalog-error'
    expect(await getPublicTournaments()).toMatchObject({ tournaments: [], error: true })
  })

  it.each([
    { preset_key: 'paid_v1' }, { business_rule_version: 3 }, { business_rule_version: '4' },
    { entry_fee_cents: 5000 }, { entry_fee_cents: '0' }, { prize_1st_cents: 100 },
    { prize_2nd_cents: 100 }, { prize_3rd_cents: 100 }, { game_type: 'snake_arena' },
  ])('does not publish or count a legacy or malformed tournament even if a response includes it: %j', async patch => {
    const legacyId = '20000000-0000-0000-0000-000000000002'
    rows = [row, { ...row, id: legacyId, ...patch }]
    const result = await getPublicTournaments()
    expect(result.error).toBe(false)
    expect(result.tournaments.map(tournament => tournament.id)).toEqual([id])
    expect(requests[1].searchParams.get('id')).not.toContain(legacyId)
  })

  it('does not ask for privileged counts when the only returned event is outside the free release', async () => {
    rows = [{ ...row, entry_fee_cents: 5000 }]
    expect(await getPublicTournaments()).toMatchObject({ tournaments: [], error: false })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
  })
})
