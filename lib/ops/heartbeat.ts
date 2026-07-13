import { createAdminClient } from '@/lib/supabase/server'

// Registra el latido de un cron. Fail-open: si la tabla no existe aún o el
// upsert falla, el cron sigue funcionando (el watchdog es observabilidad,
// nunca puede tumbar al observado).
export async function recordHeartbeat(
  jobName: string,
  status: 'ok' | 'error' = 'ok',
  detail?: string
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('cron_heartbeats').upsert(
      {
        job_name: jobName,
        last_run_at: new Date().toISOString(),
        last_status: status,
        detail: detail ?? null,
      },
      { onConflict: 'job_name' }
    )
    if (error) console.error(`[heartbeat] upsert falló para ${jobName}:`, error.message)
  } catch (e) {
    console.error(`[heartbeat] excepción para ${jobName}:`, e)
  }
}
