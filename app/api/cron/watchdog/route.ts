import { createAdminClient } from '@/lib/supabase/server'
import { sendOpsAlertEmail } from '@/lib/email/ops-notifications'
import { assessCronHeartbeats } from '@/lib/ops/health'
import type { CronHeartbeat } from '@/types/database'

// Watchdog de schedulers. Corre cada hora desde Supabase Cron y conserva
// un respaldo diario en Vercel. Comprueba los latidos que escribe la app, no
// solo que el programador haya intentado despachar una llamada.
//
// Revisa la frescura del latido de cada job y alerta por email si alguno
// está vencido o su última corrida terminó en error.

export const maxDuration = 30

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
  const { data, error } = await admin
    .from('cron_heartbeats')
    .select('job_name, last_run_at, last_status, detail')

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const problems = assessCronHeartbeats((data ?? []) as CronHeartbeat[])
    .flatMap((job) => job.problem ? [job.problem] : [])

  if (problems.length > 0) {
    await sendOpsAlertEmail({
      subject: `Scheduler caído o con errores (${problems.length})`,
      lines: [
        'El watchdog detectó problemas en los crons de la plataforma:',
        ...problems,
        'Impacto potencial: torneos sin transicionar/finalizar, pagos sin conciliar o reembolsos sin emitir.',
      ],
    })
  }

  return Response.json({
    ok: problems.length === 0,
    checkedAt: new Date().toISOString(),
    problems,
  }, { status: problems.length > 0 ? 503 : 200 })
}
