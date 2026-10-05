import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { financialError, loadPrizeEvidence } from '@/lib/payouts/review'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || !['approved', 'held'].includes(body.decision) || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 2000) {
    return Response.json({ error: 'Decisión y justificación de 10 a 2000 caracteres requeridas' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data: review, error } = await admin.from('prize_reviews').select('user_id, tournament_id').eq('id', id).single()
  if (error || !review) return Response.json({ error: 'Revisión no disponible' }, { status: error?.code === 'PGRST116' ? 404 : 503 })
  let evidence: Record<string, unknown> = {}
  if (body.decision === 'approved') {
    try { evidence = await loadPrizeEvidence(admin, review.tournament_id, review.user_id) }
    catch { return Response.json({ error: 'Evidencia incompleta: el premio sigue retenido' }, { status: 422 }) }
  }
  try {
    const { error: decisionError } = await admin.rpc('review_prize', { p_review_id: id, p_admin_id: auth.access.userId, p_decision: body.decision, p_reason: body.reason.trim(), p_evidence: evidence })
    if (decisionError) return financialError(decisionError)
    return Response.json({ ok: true })
  } catch { return financialError({ message: 'Respuesta perdida' }) }
}
