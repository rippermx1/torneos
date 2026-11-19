import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { financialError } from '@/lib/payouts/review'
import { storePayoutProof } from '@/lib/payouts/proof-storage'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.formData().catch(() => null)
  const outcome = String(body?.get('outcome') ?? '')
  const reason = String(body?.get('notes') ?? '').trim()
  const reference = String(body?.get('transferReference') ?? '').trim()
  if (!body || !['unknown', 'paid', 'not_sent'].includes(outcome) || reason.length < 10 || reason.length > 2000
    || (outcome !== 'unknown' && (reference.length < 3 || reference.length > 120))) {
    return Response.json({ error: 'Resultado bancario y justificación requeridos' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data: payout, error } = await admin.from('withdrawal_requests').select('id, status, claimed_by').eq('id', id).single()
  if (error || !payout) return Response.json({ error: 'Pago no disponible' }, { status: error?.code === 'PGRST116' ? 404 : 503 })
  if (!['transferring', 'reconciling'].includes(payout.status) || (outcome !== 'unknown' && payout.claimed_by === auth.access.userId)) {
    return Response.json({ error: 'Conciliación bancaria por segundo operador requerida' }, { status: 409 })
  }
  let path: string | null = null
  if (outcome !== 'unknown') {
    const proof = await storePayoutProof(admin, id, body.get('evidence'))
    if (proof.response) return proof.response
    path = proof.path!
  }
  try {
    const { error: reconcileError } = await admin.rpc('reconcile_withdrawal', { p_request_id: id, p_admin_id: auth.access.userId, p_outcome: outcome, p_bank_reference: reference || null, p_proof_path: path, p_reason: reason })
    // Never remove evidence after an uncertain commit.
    return reconcileError ? financialError(reconcileError) : Response.json({ ok: true })
  } catch { return financialError({ message: 'Respuesta perdida' }) }
}
