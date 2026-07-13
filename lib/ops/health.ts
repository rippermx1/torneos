import type { CronHeartbeat } from '@/types/database'

export const CRON_HEALTH_RULES = [
  {
    jobName: 'process-tournaments',
    label: 'Ciclo de torneos',
    cadenceMinutes: 5,
    maxAgeMinutes: 15,
  },
  {
    jobName: 'flow-reconcile',
    label: 'Conciliación de pagos',
    cadenceMinutes: 10,
    maxAgeMinutes: 30,
  },
  {
    jobName: 'reconcile-refunds',
    label: 'Conciliación de reembolsos',
    cadenceMinutes: 10,
    maxAgeMinutes: 30,
  },
] as const

export type CronHealthState = 'healthy' | 'missing' | 'stale' | 'error'

export interface CronJobHealth {
  jobName: (typeof CRON_HEALTH_RULES)[number]['jobName']
  label: string
  cadenceMinutes: number
  maxAgeMinutes: number
  state: CronHealthState
  lastRunAt: string | null
  ageMinutes: number | null
  detail: string | null
  problem: string | null
}

export function assessCronHeartbeats(
  rows: Pick<CronHeartbeat, 'job_name' | 'last_run_at' | 'last_status' | 'detail'>[],
  nowMs = Date.now()
): CronJobHealth[] {
  const heartbeats = new Map(rows.map((row) => [row.job_name, row]))

  return CRON_HEALTH_RULES.map((rule) => {
    const heartbeat = heartbeats.get(rule.jobName)

    if (!heartbeat) {
      return {
        ...rule,
        state: 'missing' as const,
        lastRunAt: null,
        ageMinutes: null,
        detail: null,
        problem: `${rule.jobName}: sin latidos registrados (¿scheduler nunca corrió tras el deploy?).`,
      }
    }

    const lastRunMs = new Date(heartbeat.last_run_at).getTime()
    const hasValidTimestamp = Number.isFinite(lastRunMs)
    const ageMinutes = hasValidTimestamp
      ? Math.max(0, Math.round((nowMs - lastRunMs) / 60_000))
      : null

    if (heartbeat.last_status === 'error') {
      return {
        ...rule,
        state: 'error' as const,
        lastRunAt: heartbeat.last_run_at,
        ageMinutes,
        detail: heartbeat.detail,
        problem: `${rule.jobName}: la última corrida terminó en error${heartbeat.detail ? ` (${heartbeat.detail})` : ''}.`,
      }
    }

    if (ageMinutes === null || ageMinutes > rule.maxAgeMinutes) {
      return {
        ...rule,
        state: 'stale' as const,
        lastRunAt: heartbeat.last_run_at,
        ageMinutes,
        detail: heartbeat.detail,
        problem: ageMinutes === null
          ? `${rule.jobName}: el último latido tiene una fecha inválida.`
          : `${rule.jobName}: último latido hace ${ageMinutes} min (umbral ${rule.maxAgeMinutes} min). Revisar Supabase Cron y los respaldos externos.`,
      }
    }

    return {
      ...rule,
      state: 'healthy' as const,
      lastRunAt: heartbeat.last_run_at,
      ageMinutes,
      detail: heartbeat.detail,
      problem: null,
    }
  })
}
