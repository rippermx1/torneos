import { createAdminClient } from '@/lib/supabase/server'

// A successful HTTP response requires durable evidence of completed processing.
export async function recordHeartbeat(
  jobName: string,
  status: 'started' | 'ok' | 'error' = 'ok',
  detail?: string
): Promise<void> {
  const { error } = await createAdminClient().rpc('record_cron_execution', {
    p_job: jobName, p_status: status, p_detail: detail ?? null,
  })
  if (error) throw new Error(`No se pudo registrar procesamiento de ${jobName}: ${error.message}`)
}
