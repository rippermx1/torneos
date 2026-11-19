import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { boundedJson, sameOrigin, accountError } from '@/lib/account/requests'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'

export async function POST(req: Request) {
  const originError = sameOrigin(req); if (originError) return originError
  const auth = await requireAnyRoleForApi(['user','admin','owner'], { allowSuspended: true })
  if (!auth.ok) return auth.response
  const quota = await checkRateLimit({ key: `account:password:${auth.access.userId}`, limit: 5, windowMs: 3600_000, onError: 'deny' })
  if (!quota.ok) return rateLimitResponse(quota)
  let body; try { body = await boundedJson(req) } catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return Response.json({ error: 'Usa una contraseña entre 12 y 128 caracteres.' }, { status: 400 })
  const client = await createClient()
  const claims = await client.auth.getClaims()
  const methods = claims.data?.claims.amr
  // GoTrue records email recovery as `otp`, not `recovery`. Accept only a
  // recent verified email proof; password/TOTP sessions alone cannot reset it.
  const now = Math.floor(Date.now() / 1000)
  if (claims.error || !Array.isArray(methods) || !methods.some(m => typeof m === 'object' && m !== null && m.method === 'otp' && typeof m.timestamp === 'number' && m.timestamp <= now && now - m.timestamp <= 600)) {
    return Response.json({ error: 'Solicita un nuevo enlace de recuperación para cambiar la contraseña.' }, { status: 403 })
  }
  const updated = await client.auth.updateUser({ password: body.password })
  if (updated.error) return Response.json({ error: 'Contraseña rechazada o enlace vencido. Usa una contraseña segura y un enlace vigente.' }, { status: 400 })
  const revoked = await createAdminClient().rpc('revoke_app_sessions', { p_user: auth.access.userId })
  if (revoked.error) return accountError(revoked.error)
  await client.auth.signOut({ scope: 'local' })
  return Response.json({ ok: true, signInRequired: true }, { headers: { 'Cache-Control': 'no-store' } })
}
