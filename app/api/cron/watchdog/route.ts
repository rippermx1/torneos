import { createAdminClient } from '@/lib/supabase/server'
import { sendOpsAlertEmail } from '@/lib/email/ops-notifications'

// Watchdog de schedulers. Corre cada 15 minutos desde Supabase Cron y conserva
// un respaldo diario en Vercel. Comprueba los latidos que escribe la app, no
// solo que el programador haya intentado despachar una llamada.
//
// Revisa la frescura del latido de cada job y alerta por email si alguno
// está vencido o su última corrida terminó en error.

export const maxDuration = 30

// Umbral de frescura por job (minutos). Holgado para tolerar jitter del scheduler.
const STALE_THRESHOLDS_MIN: Record<string, number> = {
  'process-tournaments': 15, // corre cada 5 min
  'flow-reconcile': 30,      // corre cada 10 min
  'reconcile-refunds': 30,   // corre cada 10 min
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
  const { data, error } = await admin
    .from('cron_heartbeats')
    .select('job_name, last_run_at, last_status, detail')

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const heartbeats = new Map(
    (data ?? []).map((row) => [row.job_name as string, row as {
      job_name: string
      last_run_at: string
      last_status: string
      detail: string | null
    }])
  )

  const nowMs = Date.now()
  const problems: string[] = []

  for (const [job, thresholdMin] of Object.entries(STALE_THRESHOLDS_MIN)) {
    const hb = heartbeats.get(job)
    if (!hb) {
      problems.push(`${job}: sin latidos registrados (¿scheduler nunca corrió tras el deploy?).`)
      continue
    }
    const ageMin = Math.round((nowMs - new Date(hb.last_run_at).getTime()) / 60_000)
    if (ageMin > thresholdMin) {
      problems.push(`${job}: último latido hace ${ageMin} min (umbral ${thresholdMin} min). Revisar Supabase Cron y GitHub Actions.`)
    } else if (hb.last_status === 'error') {
      problems.push(`${job}: la última corrida terminó en error${hb.detail ? ` (${hb.detail})` : ''}.`)
    }
  }

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
