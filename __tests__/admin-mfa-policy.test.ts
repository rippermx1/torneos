import { describe, expect, it } from 'vitest'
import {
  ADMIN_MFA_CHALLENGE_PATH,
  ADMIN_MFA_SETUP_PATH,
  getAdminMfaRedirect,
} from '@/lib/supabase/admin-mfa-policy'

describe('admin MFA policy', () => {
  it('requires enrollment when the administrator has no verified TOTP factor', () => {
    expect(getAdminMfaRedirect({ currentLevel: 'aal1', verifiedTotpFactorIds: [] }))
      .toBe(ADMIN_MFA_SETUP_PATH)
  })

  it('requires a challenge when a factor exists but the session is only AAL1', () => {
    expect(getAdminMfaRedirect({ currentLevel: 'aal1', verifiedTotpFactorIds: ['factor-1'] }))
      .toBe(ADMIN_MFA_CHALLENGE_PATH)
  })

  it('allows only an AAL2 session with a verified TOTP factor', () => {
    expect(getAdminMfaRedirect({ currentLevel: 'aal2', verifiedTotpFactorIds: ['factor-1'] }))
      .toBeNull()
  })
})
