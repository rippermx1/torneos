import { redirect } from 'next/navigation'
import { AdminMfaSetup } from '@/components/auth/admin-mfa-setup'
import { requireAnyRole } from '@/lib/supabase/auth'
import { getAdminMfaState } from '@/lib/supabase/admin-mfa'
import {
  ADMIN_MFA_CHALLENGE_PATH,
  getAdminMfaRedirect,
} from '@/lib/supabase/admin-mfa-policy'

export default async function AdminMfaSetupPage() {
  await requireAnyRole(['admin', 'owner'])
  const state = await getAdminMfaState()
  const nextPath = getAdminMfaRedirect(state)

  if (!nextPath) redirect('/admin')
  if (nextPath === ADMIN_MFA_CHALLENGE_PATH) redirect(ADMIN_MFA_CHALLENGE_PATH)

  return <AdminMfaSetup />
}
