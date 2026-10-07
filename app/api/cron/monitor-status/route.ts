import { createAdminClient } from '@/lib/supabase/server'
import { providerDispatchBlocked } from '@/lib/config/provider-dispatch.mjs'
import { assessCronHeartbeats } from '@/lib/ops/health'

// Read-only signal for a monitor hosted independently of the app and database scheduler.
export async function GET(req: Request): Promise<Response> {
  const reply = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  const secret = process.env.CRON_SECRET
  if (!secret) return reply({ error: 'Cron no configurado' }, 500)
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return reply({ error: 'No autorizado' }, 401)
  try {
    const admin = createAdminClient()
    const [heartbeats, blocked, aged, incidents] = await Promise.all([
      admin.from('cron_heartbeats').select('*'),
      admin.from('ops_notifications').select('id', { count: 'exact', head: true }).eq('state', 'blocked'),
      admin.from('ops_notifications').select('id', { count: 'exact', head: true }).in('state', ['pending', 'sending'])
        .lte('created_at', new Date(Date.now() - 30 * 60_000).toISOString()),
      admin.from('ops_incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    ])
    if (heartbeats.error || !heartbeats.data || [blocked, aged, incidents].some(r => r.error || r.count === null)) {
      return reply({ ok: false, schedulerHealthy: false, operationalReady: false, error: 'Monitor no verificable' }, 503)
    }
    const jobs = assessCronHeartbeats(heartbeats.data).map(job => ({ job: job.jobName, state: job.state, lastSuccessAt: job.lastSuccessAt }))
    const schedulerHealthy = jobs.every(job => job.state === 'healthy')
    const notificationsDeferred = providerDispatchBlocked()
    const operationalReady = schedulerHealthy && !notificationsDeferred && blocked.count === 0 && aged.count === 0 && incidents.count === 0
    return reply({ ok: operationalReady, schedulerHealthy, operationalReady, notificationsDeferred,
      lastSuccessAt: jobs.find(job => job.job === 'watchdog')?.lastSuccessAt ?? null,
      jobs, blockedNotifications: blocked.count, agedNotifications: aged.count, activeIncidents: incidents.count,
      ...(!operationalReady ? { error: schedulerHealthy ? 'Operación o canal de avisos pendiente' : 'Procesamiento sin éxito verificable reciente' } : {}),
    }, operationalReady ? 200 : 503)
  } catch { return reply({ ok: false, schedulerHealthy: false, operationalReady: false, error: 'Monitor no verificable' }, 503) }
}
