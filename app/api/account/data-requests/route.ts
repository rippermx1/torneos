import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { boundedJson, sameOrigin, accountError } from '@/lib/account/requests'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'

export async function POST(req: Request) {
  const originError = sameOrigin(req); if (originError) return originError
  const auth = await requireAnyRoleForApi(['user'], { allowSuspended: true }); if (!auth.ok) return auth.response
  const quota = await checkRateLimit({ key: `account:data:${auth.access.userId}`, limit: 5, windowMs: 3600_000, onError: 'deny' })
  if (!quota.ok) return rateLimitResponse(quota)
  let body; try { body = await boundedJson(req) } catch { return Response.json({ error: 'Solicitud invÃ¡lida' }, { status: 400 }) }
  if (typeof body.kind !== 'string' || !['access','erasure'].includes(body.kind) || typeof body.description !== 'string') return Response.json({ error: 'Solicitud invÃ¡lida' }, { status: 400 })
  const result = await createAdminClient().rpc('open_data_request', { p_user: auth.access.userId, p_kind: body.kind, p_description: body.description })
  if (result.error) return accountError(result.error)
  return Response.json({ ok: true, requestId: result.data }, { headers: { 'Cache-Control': 'no-store' } })
}
