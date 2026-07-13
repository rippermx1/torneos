import {
  reconcileStaleRefunds,
  autoRetryRejectedRefunds,
  reconcileCancelledTournamentRefunds,
} from '@/lib/tournament/refunds'
import { expireStaleCredits } from '@/lib/wallet/credit-expiry'
import { recordHeartbeat } from '@/lib/ops/heartbeat'

// Programado vía GitHub Actions (.github/workflows/reconcile-refunds.yml) cada
// 10 min, con respaldo diario en Vercel (vercel.json) por si Actions se deshabilita.
// El endpoint es idempotente, así que ejecutarlo desde ambos schedulers es seguro.
// 1. Emite reversas faltantes de torneos cancelados (red de seguridad idempotente).
// 2. Reconcilia pending cuyo webhook se perdió consultando Flow directamente.
// 3. Reintenta automáticamente refunds rechazados (hasta 3 intentos por pago).
// 4. Expira créditos de rakeback vencidos (>30 días, FIFO por usuario).

export const maxDuration = 30

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

  try {
    // El barrido de cancelados va primero: emite las reversas que falten para
    // que reconcileStaleRefunds/autoRetry las recojan en las siguientes pasadas.
    const cancelledSweep = await reconcileCancelledTournamentRefunds(3)
    const creditExpiry = await expireStaleCredits()
    const [reconcile, autoRetry] = await Promise.all([
      reconcileStaleRefunds(10),
      autoRetryRejectedRefunds(3),
    ])

    await recordHeartbeat('reconcile-refunds', 'ok')

    return Response.json({
      ok: true,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      cancelledSweep,
      creditExpiry,
      reconcile,
      autoRetry,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/reconcile-refunds] Error fatal:', message)
    await recordHeartbeat('reconcile-refunds', 'error', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
