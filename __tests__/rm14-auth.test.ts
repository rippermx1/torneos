import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ user: vi.fn(), claims: vi.fn(), rpc: vi.fn(), roleError: false, banned: false }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(path) } }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: h.user, getClaims: h.claims } }),
  createAdminClient: () => ({ rpc: h.rpc, from: (table: string) => ({
    select: () => ({ eq: () => table === 'profile_roles' ? Promise.resolve({ data: [{ role: 'user' }], error: h.roleError ? {} : null }) : ({ single: async () => ({ data: { is_banned: h.banned }, error: null }) }) }),
  }) }),
}))
import { getUser, requireAnyRoleForApi } from '@/lib/supabase/auth'
beforeEach(() => {
  vi.resetAllMocks(); h.roleError = false; h.banned = false
  h.user.mockResolvedValue({ data: { user: { id: 'user', email_confirmed_at: 'confirmed' } }, error: null })
  h.claims.mockResolvedValue({ data: { claims: { sub: 'user', session_id: 'session' } }, error: null })
  h.rpc.mockResolvedValue({ data: true, error: null })
})
describe('RM14 live authorization', () => {
  it('rejects a still signed JWT after session deletion', async () => { h.rpc.mockResolvedValue({ data: false, error: null }); expect(await getUser()).toBeNull() })
  it('requires verified claims for the same user', async () => { h.claims.mockResolvedValue({ data: { claims: { sub: 'attacker', session_id: 'session' } } }); expect(await getUser()).toBeNull(); expect(h.rpc).not.toHaveBeenCalled() })
  it('cannot authorize on session database failure', async () => { h.rpc.mockResolvedValue({ error: {} }); const r = await requireAnyRoleForApi(['user']); expect(r.ok).toBe(false); if (!r.ok) expect(r.response.status).toBe(503) })
  it('cannot fall back to legacy admin flags after role lookup failure', async () => { h.roleError = true; const r = await requireAnyRoleForApi(['user']); expect(r.ok).toBe(false); if (!r.ok) expect(r.response.status).toBe(503) })
  it('blocks suspended mutations but permits explicitly allowed support access', async () => { h.banned = true; const r = await requireAnyRoleForApi(['user']); if (!r.ok) expect(r.response.status).toBe(403); else throw new Error('Suspended allowed'); expect((await requireAnyRoleForApi(['user'], { allowSuspended: true })).ok).toBe(true) })
  it('still requires email confirmation on support routes', async () => { h.user.mockResolvedValue({ data: { user: { id: 'user' } } }); const r = await requireAnyRoleForApi(['user'], { allowSuspended: true }); if (!r.ok) expect(r.response.status).toBe(403); else throw new Error('Unverified allowed') })
})
