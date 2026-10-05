import { financialError } from '@/lib/payouts/review'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { recordAdminAction } from '@/lib/admin/audit'
import { sendWithdrawalRejectedEmail } from '@/lib/email/withdrawal-notifications'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const userId = auth.access.userId

  const { id: requestId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.notes !== 'string' || body.notes.trim().length < 10 || body.notes.length > 2000) {
    return Response.json({ error: 'Justificación de 10 a 2000 caracteres requerida' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  const { data: request } = await adminSupabase
    .from('withdrawal_requests')
    .select('user_id, amount_cents, status')
    .eq('id', requestId)
    .single()

  if (!request) {
    return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  }

  if (!['pending', 'claimed', 'approved'].includes(request.status)) {
    return Response.json({ error: 'La solicitud ya fue procesada' }, { status: 409 })
  }

  const { error } = await Promise.resolve(adminSupabase.rpc('reject_withdrawal', {
    p_request_id: requestId,
    p_admin_id: userId,
    p_notes: body.notes ?? null,
  })).catch(() => ({ error: { message: 'Respuesta perdida' } }))

  if (error) {
    return financialError(error)
  }

  await recordAdminAction(adminSupabase, {
    adminId: userId,
    action: 'payout.reject',
    targetType: 'withdrawal_request',
    targetId: requestId,
    summary: body.notes ?? 'Retiro rechazado sin nota',
    payload: { notes: body.notes ?? null },
  })

  after(async () => {
    try {
      const { data: authUser } = await adminSupabase.auth.admin.getUserById(request.user_id)
      const email = authUser?.user?.email
      const username = authUser?.user?.user_metadata?.username ?? email
      if (email) {
        await sendWithdrawalRejectedEmail({
          to: email,
          username,
          amountCents: request.amount_cents,
          reason: body.notes ?? null,
        })
      }
    } catch (e) {
      console.error('[payout.reject] Error enviando email:', e)
    }
  })

  return Response.json({ ok: true })
}
