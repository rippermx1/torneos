import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { inspectIntegrity, clearIntegrityReview } from '@/lib/anticheat/integrity'
import { isJsonObject } from '@/lib/tournament/game-request'

const isIntegrityId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// Operator API: inspect replay evidence, clear a false positive with a reason,
// or use the existing ban endpoint for a confirmed account sanction. Never
// automatically turn a regular cadence into a ban or reverse a settled prize.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!isIntegrityId(id)) return Response.json({ error: 'Torneo inválido' }, { status: 400 })
  try {
    return Response.json({ reviews: await inspectIntegrity(createAdminClient(), id) })
  } catch {
    return Response.json({ error: 'No se pudo confirmar la revisión.', code: 'INTEGRITY_STATE_UNCONFIRMED' }, { status: 503 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!isIntegrityId(id) || !isJsonObject(body) || !isIntegrityId(body.gameId)
    || typeof body.code !== 'string' || !['regular_pace', 'identity_collision'].includes(body.code)
    || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 1000) {
    return Response.json({ error: 'Partida, señal y motivo de revisión requeridos.' }, { status: 400 })
  }
  const admin = createAdminClient()
  try {
    const reviews = await inspectIntegrity(admin, id)
    if (!reviews.some(r => r.gameId === body.gameId && r.code === body.code && r.decision === 'pending')) {
      return Response.json({ error: 'La señal no está pendiente en este torneo.' }, { status: 409 })
    }
    await clearIntegrityReview(admin, { gameId: body.gameId, code: body.code as 'regular_pace' | 'identity_collision',
      actorId: auth.access.userId, reason: body.reason })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'No se pudo confirmar la decisión.', code: 'REVIEW_STATE_UNCONFIRMED' }, { status: 503 })
  }
}
