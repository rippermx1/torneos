import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { accountError } from '@/lib/account/requests'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'

export async function GET() {
  const auth = await requireAnyRoleForApi(['user'], { allowSuspended: true }); if (!auth.ok) return auth.response
  const quota = await checkRateLimit({ key: `account:export:${auth.access.userId}`, limit: 5, windowMs: 3600_000, onError: 'deny' })
  if (!quota.ok) return rateLimitResponse(quota)
  const result = await createAdminClient().rpc('account_data_export', { p_user: auth.access.userId })
  if (result.error) return accountError(result.error)
  return Response.json({ ...result.data, email: auth.access.user.email }, { headers: { 'Content-Disposition': 'attachment; filename="torneos-perfil-e-historial.json"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
