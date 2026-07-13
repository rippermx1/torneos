import { redirect } from 'next/navigation'
import { AdminMfaChallenge } from '@/components/auth/admin-mfa-challenge'
import { requireAnyRole } from '@/lib/supabase/auth'
import { getAdminMfaState } from '@/lib/supabase/admin-mfa'
import {
  ADMIN_MFA_SETUP_PATH,
  getAdminMfaRedirect,
} from '@/lib/supabase/admin-mfa-policy'

export default async function AdminMfaChallengePage() {
  await requireAnyRole(['admin', 'owner'])
  const state = await getAdminMfaState()
  const nextPath = getAdminMfaRedirect(state)

  if (!nextPath) redirect('/admin')
  if (nextPath === ADMIN_MFA_SETUP_PATH) redirect(ADMIN_MFA_SETUP_PATH)

  return <AdminMfaChallenge factorId={state.verifiedTotpFactorIds[0]} />
}
