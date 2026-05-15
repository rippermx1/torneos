import { randomUUID } from 'crypto'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { recordAdminAction } from '@/lib/admin/audit'
import { createFlowRefund } from '@/lib/flow/refunds'
import { sendTournamentCancelledEmail } from '@/lib/email/refund-notifications'
import { getAppUrl } from '@/lib/env'
import type { FlowRefundAttempt } from '@/types/database'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const { id: refundAttemptId } = await params
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('flow_refund_attempts')
    .select('*')
    .eq('id', refundAttemptId)
    .single()

  if (!existing) {
    return Response.json({ error: 'Intento de reembolso no encontrado' }, { status: 404 })
  }

  const attempt = existing as FlowRefundAttempt

  if (attempt.status !== 'rejected') {
    return Response.json(
      { error: `Solo se pueden reintentar reembolsos fallidos. Estado actual: ${attempt.status}` },
      { status: 400 }
    )
  }

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', attempt.tournament_id)
    .single()

  const appUrl = getAppUrl(new URL(req.url).origin) ?? new URL(req.url).origin
  const callbackUrl = `${appUrl}/api/webhooks/flow/refund`
  const newCommerceOrder = `ref-${randomUUID()}`

  let flowToken: string | null = null
  let flowOrder: string | null = null
  let newStatus: 'pending' | 'rejected' = 'pending'
  let errorMessage: string | null = null

  try {
    const flowResponse = await createFlowRefund({
      refundCommerceOrder: newCommerceOrder,
      receiverEmail: attempt.receiver_email,
      amountPesos: attempt.amount_pesos,
      urlCallBack: callbackUrl,
    })
    flowToken = flowResponse.token
    flowOrder = flowResponse.flowRefundOrder
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[retry] Error en Flow para refund', refundAttemptId, msg)
    newStatus = 'rejected'
    errorMessage = msg
  }

  // Insertar nuevo intento (preserva el historial del fallido anterior)
  const { data: newAttempt, error: insertErr } = await supabase
    .from('flow_refund_attempts')
    .insert({
      tournament_id: attempt.tournament_id,
      user_id: attempt.user_id,
      flow_payment_attempt_id: attempt.flow_payment_attempt_id,
      refund_commerce_order: newCommerceOrder,
      flow_refund_token: flowToken,
      flow_refund_order: flowOrder,
      amount_cents: attempt.amount_cents,
      amount_pesos: attempt.amount_pesos,
      receiver_email: attempt.receiver_email,
      status: newStatus,
      error_message: errorMessage,
    })
    .select('id')
    .single()

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  await recordAdminAction(supabase, {
    adminId: auth.access.userId,
    action: 'refund.retry',
    targetType: 'flow_refund_attempt',
    targetId: refundAttemptId,
    summary: `Reintento de reembolso para usuario ${attempt.user_id}`,
    payload: { originalId: refundAttemptId, newId: newAttempt?.id, newStatus },
  })

  // Email de notificación si el reintento fue exitoso
  if (newStatus === 'pending') {
    after(async () => {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(attempt.user_id)
        const username = authUser?.user?.user_metadata?.username ?? attempt.receiver_email
        await sendTournamentCancelledEmail({
          to: attempt.receiver_email,
          username,
          tournamentName: tournament?.name ?? 'torneo',
          amountPesos: attempt.amount_pesos,
        })
      } catch (e) {
        console.error('[retry] Error enviando email:', e)
      }
    })
  }

  return Response.json({ ok: true, newStatus, newAttemptId: newAttempt?.id })
}
