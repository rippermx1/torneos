import { createAdminClient } from '@/lib/supabase/server'

// Read-only signal for a monitor hosted independently of the app and database scheduler.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'Cron no configurado' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('cron_heartbeats')
      .select('last_success_at').eq('job_name', 'watchdog').maybeSingle()
    const ms = data?.last_success_at ? Date.parse(data.last_success_at) : NaN
    if (error || !Number.isFinite(ms) || ms > Date.now() + 60_000 || Date.now() - ms >= 15 * 60_000) {
      return Response.json({ ok: false, error: 'Monitor sin éxito verificable reciente' }, { status: 503 })
    }
    const [blocked, aged] = await Promise.all([
      admin.from('ops_notifications').select('id', { count: 'exact', head: true }).eq('state', 'blocked'),
      admin.from('ops_notifications').select('id', { count: 'exact', head: true }).in('state', ['pending', 'sending'])
        .lte('created_at', new Date(Date.now() - 30 * 60_000).toISOString()),
    ])
    if (blocked.error || aged.error || blocked.count === null || aged.count === null || blocked.count > 0 || aged.count > 0) {
      return Response.json({ ok: false, error: 'Canal de avisos sin aceptación verificable' }, { status: 503 })
    }
    return Response.json({ ok: true, lastSuccessAt: data!.last_success_at })
  } catch { return Response.json({ ok: false, error: 'Monitor no verificable' }, { status: 503 }) }
}
