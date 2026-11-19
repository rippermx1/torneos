import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sameOrigin, accountError } from '@/lib/account/requests'

export async function POST(req: Request) {
  const originError = sameOrigin(req); if (originError) return originError
  const auth = await requireAnyRoleForApi(['user','admin','owner'], { allowSuspended: true })
  if (!auth.ok) return auth.response
  const revoked = await createAdminClient().rpc('revoke_app_sessions', { p_user: auth.access.userId })
  if (revoked.error) return accountError(revoked.error)
  await (await createClient()).auth.signOut({ scope: 'local' })
  return Response.json({ ok: true, sessionsRevoked: revoked.data }, { headers: { 'Cache-Control': 'no-store' } })
}
