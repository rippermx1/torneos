import { describe, expect, it } from 'vitest'
import { assessCronHeartbeats, CRON_HEALTH_RULES } from '@/lib/ops/health'
import type { CronHeartbeat } from '@/types/database'

const NOW = Date.parse('2026-07-13T12:00:00.000Z')

function heartbeat(
  jobName: string,
  minutesAgo: number,
  status: CronHeartbeat['last_status'] = 'ok',
  detail: string | null = null
): CronHeartbeat {
  return {
    job_name: jobName,
    last_run_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
    last_status: status,
    detail,
  }
}

describe('assessCronHeartbeats', () => {
  it('marca todos los jobs como saludables dentro de sus umbrales', () => {
    const result = assessCronHeartbeats([
      heartbeat('process-tournaments', 5),
      heartbeat('flow-reconcile', 10),
      heartbeat('reconcile-refunds', 10),
    ], NOW)

    expect(result).toHaveLength(CRON_HEALTH_RULES.length)
    expect(result.every((job) => job.state === 'healthy')).toBe(true)
    expect(result.every((job) => job.problem === null)).toBe(true)
  })

  it('detecta un job que nunca registró latidos', () => {
    const result = assessCronHeartbeats([], NOW)

    expect(result[0]).toMatchObject({
      jobName: 'process-tournaments',
      state: 'missing',
      lastRunAt: null,
    })
    expect(result[0].problem).toContain('sin latidos registrados')
  })

  it('detecta un latido vencido', () => {
    const result = assessCronHeartbeats([
      heartbeat('process-tournaments', 16),
    ], NOW)

    expect(result[0]).toMatchObject({
      state: 'stale',
      ageMinutes: 16,
      maxAgeMinutes: 15,
    })
  })

  it('prioriza el error explícito y conserva su detalle', () => {
    const result = assessCronHeartbeats([
      heartbeat('process-tournaments', 2, 'error', 'Falló la transición'),
    ], NOW)

    expect(result[0]).toMatchObject({
      state: 'error',
      detail: 'Falló la transición',
    })
    expect(result[0].problem).toContain('Falló la transición')
  })
})
