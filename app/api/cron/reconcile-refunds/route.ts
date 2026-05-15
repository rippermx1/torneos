import { reconcileStaleRefunds } from '@/lib/tournament/refunds'

// Consulta a Flow el estado real de los reembolsos que llevan más de
// 10 minutos en 'pending' sin recibir webhook.  Cubre el caso de
// callbacks perdidos por red o reinicio del servidor.
//
// Llamar cada 10-15 minutos:
//   Authorization: Bearer {CRON_SECRET}

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
    const result = await reconcileStaleRefunds(10)

    return Response.json({
      ok: true,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/reconcile-refunds] Error fatal:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
