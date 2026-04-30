import { createAdminClient } from '@/lib/supabase/server'
import { getFlowPaymentStatus, FlowPaymentStatusCode } from '@/lib/flow/payments'

// ───────────────────────────────────────────────────────────────
// Cron: reconcilia flow_payment_attempts en estado 'pending'.
//
// Por qué existe:
// - El webhook de Flow puede perderse (timeout, deploy, error transitorio).
// - Sin esto, un attempt queda en 'pending' indefinidamente y el usuario
//   ve "procesando" para siempre incluso si pagó.
//
// Política:
// - Cada attempt con flow_token y > 5 min de antigüedad se consulta a Flow.
// - Si Flow dice paid → acreditamos via wallet_credit_flow_payment.
// - Si Flow dice rejected/cancelled → marcamos como failed.
// - Attempts > 60 min sin flow_token o aún pending se marcan como expired.
//
// Programar: cada 10 minutos.
// ───────────────────────────────────────────────────────────────

export const maxDuration = 60

interface ReconcileResult {
  commerceOrder: string
  action: 'credited' | 'failed' | 'expired' | 'still_pending' | 'error'
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

  const admin = createAdminClient()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // 1. Attempts con flow_token y antigüedad > 5min → consultar Flow
  const { data: pending } = await admin
    .from('flow_payment_attempts')
    .select('id, commerce_order, flow_token, charged_amount_cents, created_at')
    .eq('status', 'pending')
    .not('flow_token', 'is', null)
    .lt('created_at', fiveMinAgo)
    .limit(50)

  const results: ReconcileResult[] = []

  for (const attempt of pending ?? []) {
    if (!attempt.flow_token) continue
    try {
      const status = await getFlowPaymentStatus(attempt.flow_token)
      const code = status.status as FlowPaymentStatusCode

      if (code === 2) {
        // Pagado — acreditar
        const amountCents = Math.round(status.amount * 100)
        const { error } = await admin.rpc('wallet_credit_flow_payment', {
          p_commerce_order: status.commerceOrder,
          p_flow_token: attempt.flow_token,
          p_flow_order: status.flowOrder,
          p_amount_cents: amountCents,
          p_payment_method: status.paymentData?.media ?? null,
          p_payer_email: status.payer ?? null,
          p_raw: status as unknown as Record<string, unknown>,
        })
        if (error && !error.message.includes('duplicate key')) {
          results.push({ commerceOrder: attempt.commerce_order, action: 'error', detail: error.message })
        } else {
          results.push({ commerceOrder: attempt.commerce_order, action: 'credited' })
        }
      } else if (code === 3 || code === 4) {
        // Rechazado o anulado
        await admin.rpc('wallet_mark_flow_attempt_failed', {
          p_commerce_order: attempt.commerce_order,
          p_flow_token: attempt.flow_token,
          p_flow_status_code: code,
          p_raw: status as unknown as Record<string, unknown>,
        })
        results.push({ commerceOrder: attempt.commerce_order, action: 'failed', detail: `flow_status=${code}` })
      } else {
        results.push({ commerceOrder: attempt.commerce_order, action: 'still_pending' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ commerceOrder: attempt.commerce_order, action: 'error', detail: message })
    }
  }

  // 2. Attempts viejos sin flow_token o aún pending → expirar
  const { data: expired } = await admin
    .from('flow_payment_attempts')
    .update({ status: 'expired', settled_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lt('created_at', sixtyMinAgo)
    .select('commerce_order')

  for (const e of expired ?? []) {
    results.push({ commerceOrder: e.commerce_order as string, action: 'expired' })
  }

  return Response.json({
    ok: true,
    processedAt: new Date().toISOString(),
    total: results.length,
    results,
  })
}
