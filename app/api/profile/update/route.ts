import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `profile:update:${userId}:${getRequestIp(req)}`,
    limit: 20,
    windowMs: 60 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  let body: { username?: string; full_name?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const username  = body.username?.trim()
  const full_name = body.full_name?.trim() ?? null

  if (!username || username.length < 3) {
    return Response.json({ error: 'El usuario debe tener al menos 3 caracteres.' }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return Response.json({ error: 'Solo se permiten letras, números y guión bajo.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('profiles')
    .update({ username, full_name: full_name || null })
    .eq('id', userId)

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Ese nombre de usuario ya está en uso.' }, { status: 409 })
    }
    return Response.json({ error: `Error guardando: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true })
}
