export const ADMIN_MFA_SETUP_PATH = '/admin/mfa/setup'
export const ADMIN_MFA_CHALLENGE_PATH = '/admin/mfa/challenge'

export interface AdminMfaPolicyState {
  currentLevel: 'aal1' | 'aal2' | null
  verifiedTotpFactorIds: readonly string[]
}

export function getAdminMfaRedirect(state: AdminMfaPolicyState): string | null {
  if (state.verifiedTotpFactorIds.length === 0) {
    return ADMIN_MFA_SETUP_PATH
  }

  if (state.currentLevel !== 'aal2') {
    return ADMIN_MFA_CHALLENGE_PATH
  }

  return null
}
