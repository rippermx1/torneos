import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import type { DisputeType } from '@/types/database'
import { sameOrigin, boundedJson, accountError } from '@/lib/account/requests'

const VALID_TYPES = new Set<string>(['payment', 'tournament_result', 'technical', 'other'])

interface DisputeBody {
  type: DisputeType
  description: string
  tournamentId?: string
  kind?: 'consultation' | 'dispute' | 'incident'
}

export async function POST(req: Request): Promise<Response> {
  const originError = sameOrigin(req); if (originError) return originError
  const auth = await requireAnyRoleForApi(['user'], { allowSuspended: true })
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `support:dispute:${userId}:${getRequestIp(req)}`,
    limit: 10,
    windowMs: 60 * 60_000,
    onError: 'deny',
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  let body: DisputeBody
  try {
    body = await boundedJson(req) as unknown as DisputeBody
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { type, description, tournamentId } = body

  if (!VALID_TYPES.has(type)) {
    return Response.json({ error: 'Tipo de disputa inválido' }, { status: 400 })
  }
  if (typeof description !== 'string' || description.trim().length < 20) {
    return Response.json(
      { error: 'La descripción debe tener al menos 20 caracteres' },
      { status: 400 }
    )
  }
  if (description.trim().length > 2000) {
    return Response.json({ error: 'La descripción es demasiado larga (máx 2000 caracteres)' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (tournamentId && !/^[0-9a-f-]{36}$/i.test(tournamentId)) return Response.json({ error: 'Torneo inválido' }, { status: 400 })
  const { data, error } = await supabase.rpc('open_support_case', {
    p_user: userId, p_type: type, p_description: description.trim(), p_tournament: tournamentId ?? null, p_kind: body.kind ?? 'dispute',
  })

  if (error || !data) {
    return accountError(error ?? {})
  }

  return Response.json({ ok: true, disputeId: data })
}
