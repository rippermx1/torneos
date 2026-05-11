import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import type { DisputeType } from '@/types/database'

const VALID_TYPES = new Set<string>(['payment', 'tournament_result', 'technical', 'other'])

interface DisputeBody {
  type: DisputeType
  description: string
  tournamentId?: string
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `support:dispute:${userId}:${getRequestIp(req)}`,
    limit: 10,
    windowMs: 60 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  let body: DisputeBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { type, description, tournamentId } = body

  if (!VALID_TYPES.has(type)) {
    return Response.json({ error: 'Tipo de disputa inválido' }, { status: 400 })
  }
  if (!description?.trim() || description.trim().length < 20) {
    return Response.json(
      { error: 'La descripción debe tener al menos 20 caracteres' },
      { status: 400 }
    )
  }
  if (description.trim().length > 2000) {
    return Response.json({ error: 'La descripción es demasiado larga (máx 2000 caracteres)' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('disputes')
    .insert({
      user_id: userId,
      type,
      description: description.trim(),
      tournament_id: tournamentId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return Response.json({ error: 'Error al enviar la disputa' }, { status: 500 })
  }

  return Response.json({ ok: true, disputeId: data.id })
}
