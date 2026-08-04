import { recordAdminAction } from '@/lib/admin/audit'
import { parseDateTimeLocalToIso } from '@/lib/utils'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = (await req.json().catch(() => null)) as
    | { number?: unknown; issuedOn?: unknown; notes?: unknown }
    | null
  const number = typeof body?.number === 'string' ? body.number.trim() : ''
  const issuedOn = typeof body?.issuedOn === 'string' ? body.issuedOn : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''

  if (number.length < 1 || number.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) {
    return Response.json({ error: 'Folio o fecha de emisión inválidos' }, { status: 400 })
  }

  const issuedAt = parseDateTimeLocalToIso(`${issuedOn}T12:00`)
  if (Date.parse(issuedAt) > Date.now() + 24 * 60 * 60 * 1000) {
    return Response.json({ error: 'La fecha de emisión no puede estar en el futuro' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: refund } = await admin
    .from('flow_refund_attempts')
    .select('id, status, tax_document_status, amount_cents, flow_payment_attempt_id')
    .eq('id', id)
    .single()

  if (!refund) return Response.json({ error: 'Devolución no encontrada' }, { status: 404 })
  if (refund.status !== 'completed' || refund.tax_document_status !== 'required') {
    return Response.json(
      { error: 'La devolución no está completada o su nota de crédito ya fue registrada' },
      { status: 409 }
    )
  }

  const { data: updated, error } = await admin
    .from('flow_refund_attempts')
    .update({
      tax_document_status: 'issued',
      tax_document_number: number,
      tax_document_issued_at: issuedAt,
      tax_document_notes: notes || null,
    })
    .eq('id', id)
    .eq('status', 'completed')
    .eq('tax_document_status', 'required')
    .select('id')
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!updated) {
    return Response.json({ error: 'La nota de crédito ya fue registrada' }, { status: 409 })
  }

  await recordAdminAction(admin, {
    adminId: auth.access.userId,
    action: 'refund.credit_note.record',
    targetType: 'flow_refund_attempt',
    targetId: id,
    summary: `Registró nota de crédito ${number}`,
    payload: {
      flow_payment_attempt_id: refund.flow_payment_attempt_id,
      amount_cents: refund.amount_cents,
      tax_document_number: number,
      tax_document_issued_at: issuedAt,
    },
  })

  return Response.json({ ok: true })
}
