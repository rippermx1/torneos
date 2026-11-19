import { createAdminClient } from '@/lib/supabase/server'
import { reconcileFlowPayment } from '@/lib/flow/settlement'
import { recordHeartbeat } from '@/lib/ops/heartbeat'
import { workerCanStart, workerDeadline } from '@/lib/ops/worker-budget'

// Read-only provider recovery, including response loss and legacy checkout expiry.
// A provider query failure never changes the financial result to expired/rejected.
export const maxDuration = 60

interface ReconcileResult {
  commerceOrder: string
  action: 'credited' | 'failed' | 'refund_queued' | 'still_pending' | 'error'
  detail?: string
}

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const startedAt = Date.now()
  const deadlineMs = workerDeadline(startedAt)

  try {
    await recordHeartbeat('flow-reconcile', 'started')
    const admin = createAdminClient()
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    // Attempts pendientes/desconocidos o vencidos, incluso sin token → consultar Flow
    const { data: pending, error: pendingError } = await admin
      .from('flow_payment_attempts')
      .select('id, commerce_order, flow_token, charged_amount_cents, created_at')
      .in('status', ['pending', 'unknown', 'expired'])
      .lt('created_at', fiveMinAgo)
      .order('last_reconciled_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }).limit(50)

    if (pendingError) throw new Error(`No se pudieron leer pagos pendientes: ${pendingError.message}`)

    const results: ReconcileResult[] = []

    for (const attempt of pending ?? []) {
      if (!workerCanStart(deadlineMs)) break
      try {
        const settlement = await reconcileFlowPayment(attempt.commerce_order)
        const code = settlement.status.status

        if (settlement.credited) {
          results.push({ commerceOrder: attempt.commerce_order, action: 'credited' })
        } else if (settlement.refundId) {
          results.push({ commerceOrder: attempt.commerce_order, action: 'refund_queued' })
        } else if (code === 3 || code === 4) {
          results.push({ commerceOrder: attempt.commerce_order, action: 'failed', detail: `flow_status=${code}` })
        } else {
          results.push({ commerceOrder: attempt.commerce_order, action: 'still_pending' })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ commerceOrder: attempt.commerce_order, action: 'error', detail: message })
      } finally {
        const stamp = await admin.from('flow_payment_attempts')
          .update({ last_reconciled_at: new Date().toISOString() }).eq('id', attempt.id)
        if (stamp.error) results.push({ commerceOrder: attempt.commerce_order, action: 'error', detail: 'No se pudo guardar la revisión del pago' })
      }
    }

    const errorCount = results.filter((r) => r.action === 'error').length
    await recordHeartbeat(
      'flow-reconcile',
      errorCount > 0 ? 'error' : 'ok',
      errorCount > 0 ? `${errorCount} attempts con error` : undefined
    )

    return Response.json({
      ok: errorCount === 0,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      total: results.length,
      deferred: (pending?.length ?? 0) - new Set(results.map(r => r.commerceOrder)).size,
      errors: errorCount,
      results,
    }, { status: errorCount > 0 ? 500 : 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/flow-reconcile] Error fatal:', message)
    await recordHeartbeat('flow-reconcile', 'error', message).catch(error => console.error('[cron] Registro operativo falló', error))
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
