import { describe, expect, it, vi } from 'vitest'
import type { createAdminClient } from '@/lib/supabase/server'
import { requireCompetitiveEntry } from '@/lib/tournament/competitive-entry'

describe('competitive entry authorization', () => {
  const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as ReturnType<typeof createAdminClient>
  it('requires affirmative database authorization for the authenticated owner and tournament', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    expect(await requireCompetitiveEntry(client(rpc), 'owner', 'tournament')).toBeNull()
    expect(rpc).toHaveBeenCalledWith('authorize_competitive_entry', { p_user_id: 'owner', p_tournament_id: 'tournament' })
  })
  it.each([null, false, undefined, {}, [], 'true', 1])('denies malformed/nonaffirmative authorization %j', async data => {
    const response = await requireCompetitiveEntry(client(vi.fn().mockResolvedValue({ data, error: null })), 'a', 't')
    expect(response?.status).toBe(503)
    expect(await response?.json()).toMatchObject({ code: 'ENTRY_AUTHORIZATION_UNAVAILABLE' })
  })
  it.each([['PT402', 402], ['PT403', 403], ['PGRST202', 503], ['42501', 503], ['PT404', 503]])(
    'fails safely for %s without leaking diagnostics', async (code, status) => {
      const response = await requireCompetitiveEntry(client(vi.fn().mockResolvedValue({ data: true,
        error: { code, message: 'private SQL detail' } })), 'a', 't')
      expect(response?.status).toBe(status)
      expect(JSON.stringify(await response?.json())).not.toContain('private')
    })
  it('denies a thrown network error', async () => {
    const response = await requireCompetitiveEntry(client(vi.fn().mockRejectedValue(new Error('private transport'))), 'a', 't')
    expect(response?.status).toBe(503)
  })
})
