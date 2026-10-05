import { createAdminClient } from '@/lib/supabase/server'
import { runOperationalMonitor } from '@/lib/ops/monitor'

export const maxDuration = 60

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const job = new URL(req.url).searchParams.get('job')
  if (!job || !['process-tournaments', 'flow-reconcile', 'reconcile-refunds'].includes(job)) {
    return Response.json({ error: 'Proceso inválido' }, { status: 400 })
  }
  try {
    const { error } = await createAdminClient().rpc('record_cron_dispatch_failure', { p_job: job })
    if (error) throw error
    const result = await runOperationalMonitor()
    return Response.json({ ok: result.failed === 0 && result.unresolvedNotifications === 0,
      failureRecorded: true, activeIncidents: result.snapshot.active_incidents }, { status: result.failed || result.unresolvedNotifications ? 503 : 200 })
  } catch {
    return Response.json({ ok: false, error: 'No se pudo registrar o notificar el fallo' }, { status: 503 })
  }
}
