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
    maxAgeMinutes: 15,
  },
  {
    jobName: 'reconcile-refunds',
    label: 'Conciliación de reembolsos',
    cadenceMinutes: 10,
    maxAgeMinutes: 15,
  },
  { jobName: 'watchdog', label: 'Monitor de obligaciones', cadenceMinutes: 5, maxAgeMinutes: 15 },
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
  lastStartedAt: string | null
  lastSuccessAt: string | null
  consecutiveFailures: number
  critical: boolean
}

export function assessCronHeartbeats(
  rows: CronHeartbeat[],
  nowMs = Date.now()
): CronJobHealth[] {
  const heartbeats = new Map(rows.map((row) => [row.job_name, row]))

  return CRON_HEALTH_RULES.map((rule) => {
    const heartbeat = heartbeats.get(rule.jobName)
    const successAt = heartbeat?.last_success_at ?? null
    const successMs = successAt ? Date.parse(successAt) : NaN
    const critical = !Number.isFinite(successMs) || nowMs - successMs >= rule.maxAgeMinutes * 60_000 || (heartbeat?.consecutive_failures ?? 0) >= 2 || (heartbeat?.consecutive_dispatch_failures ?? 0) >= 2
    const execution = { lastStartedAt: heartbeat?.last_started_at ?? null, lastSuccessAt: successAt,
      consecutiveFailures: heartbeat?.consecutive_failures ?? 0, critical }

    if (!heartbeat) {
      return {
        ...rule, ...execution,
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
        ...rule, ...execution,
        state: 'error' as const,
        lastRunAt: heartbeat.last_run_at,
        ageMinutes,
        detail: heartbeat.detail,
        problem: `${rule.jobName}: la última corrida terminó en error${heartbeat.detail ? ` (${heartbeat.detail})` : ''}.`,
      }
    }

    if (ageMinutes === null || critical) {
      return {
        ...rule, ...execution,
        state: 'stale' as const,
        lastRunAt: heartbeat.last_run_at,
        ageMinutes,
        detail: heartbeat.detail,
        problem: !Number.isFinite(successMs)
          ? `${rule.jobName}: sin éxito de procesamiento registrado con fecha válida.`
          : `${rule.jobName}: sin éxito de procesamiento en los últimos ${rule.maxAgeMinutes} min. Revisar Supabase Cron y los respaldos externos.`,
      }
    }

    return {
      ...rule, ...execution,
      state: 'healthy' as const,
      lastRunAt: heartbeat.last_run_at,
      ageMinutes,
      detail: heartbeat.detail,
      problem: null,
    }
  })
}
