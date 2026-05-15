import { reconcileStaleRefunds, autoRetryRejectedRefunds } from '@/lib/tournament/refunds'

// Cada 15 minutos (vercel.json):
// 1. Reconcilia pending cuyo webhook se perdió consultando Flow directamente.
// 2. Reintenta automáticamente refunds rechazados (hasta 3 intentos por pago).

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
    const [reconcile, autoRetry] = await Promise.all([
      reconcileStaleRefunds(10),
      autoRetryRejectedRefunds(3),
    ])

    return Response.json({
      ok: true,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      reconcile,
      autoRetry,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/reconcile-refunds] Error fatal:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
