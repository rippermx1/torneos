import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import { CURRENT_TERMS_VERSION } from '@/lib/legal/terms'

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const rateLimit = await checkRateLimit({
    key: `profile:accept-terms:${auth.access.userId}:${getRequestIp(req)}`,
    limit: 10,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  const supabase = createAdminClient()
  const acceptedAt = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    .update({
      terms_accepted_at: acceptedAt,
      terms_version: CURRENT_TERMS_VERSION,
    })
    .eq('id', auth.access.userId)

  if (error) {
    return Response.json({ error: `Error registrando aceptación: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true, version: CURRENT_TERMS_VERSION, acceptedAt })
}
