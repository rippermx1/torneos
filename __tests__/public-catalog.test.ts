import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => mocks)
import { getPublicTournaments } from '@/lib/tournament/public-catalog'

const id = '10000000-0000-0000-0000-000000000001'
const row = { id, name: 'Tournament', game_type: '2048_score', status: 'open', max_players: 15,
  registration_opens_at: '2020-01-01T00:00:00Z', play_window_start: '2090-01-01T00:00:00Z', play_window_end: '2090-01-02T00:00:00Z' }

describe('public catalogue data contract', () => {
  let requests: URL[]
  let mode: 'ok' | 'empty' | 'catalog-error' | 'count-error' | 'missing-count' | 'missing-key'
  beforeEach(() => {
    requests = []
    mode = 'ok'
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
          : mode === 'empty' ? [] : [row])
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
})
