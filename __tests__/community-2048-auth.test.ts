import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>, roles: ['user'], level: 'aal1' as 'aal1' | 'aal2',
  factors: ['existing-factor'], getUser: vi.fn(),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: state.getUser,
    mfa: { listFactors: async () => ({ data: { totp: state.factors.map(id => ({ id, status: 'verified' })) }, error: null }),
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: state.level }, error: null }) } } }),
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({
    data: state.roles.map(role => ({ role })), error: null,
  }) }) }) }),
}))

import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'

beforeEach(() => {
  vi.clearAllMocks(); state.roles = ['user']; state.level = 'aal1'; state.factors = ['existing-factor']
  state.user = { id: 'qa', email_confirmed_at: '2026-10-16T15:00:00Z', user_metadata: {} }
  state.getUser.mockImplementation(async () => ({ data: { user: state.user }, error: null }))
})

describe('effective Auth checks reused by community entry points', () => {
  it('denies a guest and requires confirmed email for a player', async () => {
    state.user = null
    const guest = await requireAnyRoleForApi(['user'])
    expect(guest.ok).toBe(false); if (!guest.ok) expect(guest.response.status).toBe(401)
    state.user = { id: 'qa', user_metadata: {} }
    const unconfirmed = await requireAnyRoleForApi(['user'])
    expect(unconfirmed.ok).toBe(false)
    if (!unconfirmed.ok) { expect(unconfirmed.response.status).toBe(403); expect(await unconfirmed.response.json()).toMatchObject({ emailNotConfirmed: true }) }
  })
  it('allows an ordinary confirmed player without a monetary identity or KYC claim', async () => {
    expect((await requireAnyRoleForApi(['user'])).ok).toBe(true)
  })
  it('does not elevate user-editable metadata to operator authority', async () => {
    state.user!.user_metadata = { is_admin: true, roles: ['owner'], aal: 'aal2' }
    const result = await requireAdminMfaForApi()
    expect(result.ok).toBe(false); if (!result.ok) expect(result.response.status).toBe(403)
  })
  it('keeps an operator without user role outside the participant APIs', async () => {
    state.roles = ['admin']
    const result = await requireAnyRoleForApi(['user'])
    expect(result.ok).toBe(false); if (!result.ok) expect(result.response.status).toBe(403)
  })
  it('requires the existing operator session to reach AAL2 for creation/finalization', async () => {
    state.roles = ['admin']
    const aal1 = await requireAdminMfaForApi()
    expect(aal1.ok).toBe(false)
    if (!aal1.ok) { expect(aal1.response.status).toBe(403); expect(await aal1.response.json()).toMatchObject({ mfaRequired: true }) }
    state.level = 'aal2'
    expect((await requireAdminMfaForApi()).ok).toBe(true)
  })
})
