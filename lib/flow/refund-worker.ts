import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { createFlowRefund, getFlowRefundStatus, type FlowRefundResponse } from '@/lib/flow/refunds'
import { getAppUrl } from '@/lib/env'
import type { FlowRefundAttempt } from '@/types/database'
import { sendTournamentCancelledEmail } from '@/lib/email/refund-notifications'
import { workerCanStart, workerDeadline } from '@/lib/ops/worker-budget'

// Claims never expire into permission to send again. A dispatch can have reached
// Flow even when this process died before persisting the token.
export async function dispatchRefund(id: string, origin?: string): Promise<{
  dispatched: boolean; token?: string; error?: string
}> {
  const appUrl = getAppUrl(origin)
  if (!appUrl) throw new Error('APP_URL no configurado')
  const admin = createAdminClient()
  const nonce = randomUUID()
  const { data, error } = await admin.rpc('claim_flow_refund', { p_refund_id: id, p_nonce: nonce })
  if (error) throw new Error(error.message)
  if (!data) return { dispatched: false }
  const row = data as unknown as FlowRefundAttempt & { commerce_trx_id: string; flow_trx_id: number | null;
    tournament_name: string | null; tournament_status: string | null }
  let response: FlowRefundResponse
  try {
    response = await createFlowRefund({
      refundCommerceOrder: row.refund_commerce_order, receiverEmail: row.receiver_email,
      amountPesos: row.amount_pesos, urlCallBack: `${appUrl}/api/webhooks/flow/refund`,
      commerceTrxId: row.commerce_trx_id, flowTrxId: row.flow_trx_id ?? undefined,
    })
    if (!response.token || !response.flowRefundOrder || Number(response.amount) !== row.amount_pesos) {
      throw new Error('Respuesta de creación Flow incompleta o monto inconsistente; conciliar antes de reenviar')
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const recorded = await admin.rpc('record_flow_refund_dispatch', {
      p_refund_id: id, p_nonce: nonce, p_token: null, p_flow_order: null, p_error: message,
    })
    if (recorded.error || recorded.data !== true) throw new Error(recorded.error?.message ?? 'No se pudo registrar incertidumbre del reembolso')
    return { dispatched: false, error: message }
  }
  // A persistence failure must not enter the external-create catch or retry Flow.
  const saved = await admin.rpc('record_flow_refund_dispatch', {
    p_refund_id: id, p_nonce: nonce, p_token: response.token, p_flow_order: String(response.flowRefundOrder), p_error: null,
  })
  if (saved.error || saved.data !== true) throw new Error(saved.error?.message ?? 'No se pudo guardar correlación de reembolso; no reenviar')
  if (row.tournament_status === 'cancelled') {
    void sendTournamentCancelledEmail({ to: row.receiver_email, username: row.receiver_email,
      tournamentName: row.tournament_name ?? 'torneo', amountPesos: row.amount_pesos })
      .catch(e => console.error('[refund-dispatch] Email cancelación:', e))
  }
  return { dispatched: true, token: response.token }
}

export async function recordRefundStatus(id: string, token: string, response: FlowRefundResponse): Promise<boolean> {
  if (response.token !== token) throw new Error('Token de reembolso Flow inconsistente')
  const status = ['created', 'pending'].includes(response.status) ? 'pending' : response.status
  if (!['pending', 'completed', 'rejected', 'cancelled'].includes(status)) throw new Error('Estado de reembolso Flow desconocido')
  const amount = Number(response.amount)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Monto de reembolso Flow inválido')
  const { data, error } = await createAdminClient().rpc('record_verified_refund', {
    p_refund_id: id, p_token: token, p_flow_order: String(response.flowRefundOrder), p_amount_pesos: amount, p_status: status,
  })
  if (error) throw new Error(error.message)
  return data === true
}

export async function reconcileRefund(id: string, token: string): Promise<boolean> {
  return recordRefundStatus(id, token, await getFlowRefundStatus(token))
}

export async function dispatchQueuedRefunds(deadlineMs = workerDeadline()): Promise<{ retried: number; skipped: number; errors: number; deferred: number }> {
  const admin = createAdminClient()
  // A terminated worker leaves dispatching behind. Make the uncertainty visible;
  // preserve its nonce so its late response may still attach correlation safely.
  const stale = await admin.from('flow_refund_attempts')
    .update({ status: 'unknown', error_message: 'Envío interrumpido; conciliar con Flow antes de reenviar' })
    .eq('status', 'dispatching').lt('dispatched_at', new Date(Date.now() - 10 * 60_000).toISOString())
  if (stale.error) throw new Error(stale.error.message)
  const { data, error } = await admin.from('flow_refund_attempts').select('id')
    .eq('status', 'queued').order('created_at', { ascending: true }).limit(50)
  if (error) throw new Error(error.message)
  let retried = 0, skipped = 0, errors = 0
  let processed = 0
  for (const row of data ?? []) {
    if (!workerCanStart(deadlineMs)) break
    processed++
    try {
      const result = await dispatchRefund(row.id)
      if (result.error) errors++
      else if (result.dispatched) retried++
      else skipped++
    } catch (e) { console.error('[refund-dispatch]', row.id, e); errors++ }
  }
  const unresolved = await admin.from('flow_refund_attempts').select('id', { count: 'exact', head: true })
    .in('status', ['unknown', 'manual', 'rejected', 'cancelled'])
  if (unresolved.error) throw new Error(unresolved.error.message)
  // Count unresolved obligations too: a scheduler must not report healthy while
  // financial work requires human reconciliation.
  errors += unresolved.count ?? 0
  return { retried, skipped, errors, deferred: (data?.length ?? 0) - processed }
}
