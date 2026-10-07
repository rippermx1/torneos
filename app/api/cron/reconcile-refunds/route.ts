import {
  reconcileStaleRefunds,
  reconcileCancelledTournamentRefunds,
} from '@/lib/tournament/refunds'
import { dispatchQueuedRefunds } from '@/lib/flow/refund-worker'
import { expireStaleCredits } from '@/lib/wallet/credit-expiry'
import { recordHeartbeat } from '@/lib/ops/heartbeat'
import { workerDeadline } from '@/lib/ops/worker-budget'

// Programado vía Supabase Cron cada 10 min, con respaldos en GitHub Actions y
// Vercel. El endpoint es idempotente, así que las corridas pueden coincidir.
// 1. Emite reversas faltantes de torneos cancelados (red de seguridad idempotente).
// 2. Reconcilia pending cuyo webhook se perdió consultando Flow directamente.
// 3. Envía obligaciones queued; nunca reenvía una operación incierta o rechazada.
// 4. Expira créditos de rakeback vencidos (>30 días, FIFO por usuario).

export const maxDuration = 60

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/reconcile-refunds] CRON_SECRET no configurado')
    return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const startedAt = Date.now()
  const deadlineMs = workerDeadline(startedAt)

  try {
    await recordHeartbeat('reconcile-refunds', 'started')
    // El barrido de cancelados va primero: emite las reversas que falten para
    // que los trabajadores recuperen las obligaciones registradas.
    const cancelledSweep = await reconcileCancelledTournamentRefunds(deadlineMs)
    const creditExpiry = await expireStaleCredits()
    const [reconcile, dispatch] = await Promise.all([
      reconcileStaleRefunds(10, deadlineMs),
      dispatchQueuedRefunds(deadlineMs),
    ])

    const errors = cancelledSweep.refundsFailed + reconcile.errors + dispatch.errors
    await recordHeartbeat('reconcile-refunds', errors ? 'error' : 'ok', errors ? `${errors} operaciones sin resolver` : undefined)

    return Response.json({
      ok: errors === 0,
      errors,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      cancelledSweep,
      creditExpiry,
      reconcile,
      dispatch,
    }, { status: errors ? 500 : 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/reconcile-refunds] Error fatal:', message)
    await recordHeartbeat('reconcile-refunds', 'error', message).catch(error => console.error('[cron] Registro operativo falló', error))
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
