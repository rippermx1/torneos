import { describe, expect, it, vi } from 'vitest'
import { buildRm12SchedulerSql } from '../scripts/configure-rm12-scheduler.mjs'
import { checkRm12Monitor } from '../scripts/monitor-rm12-develop.mjs'
const now = Date.parse('2026-10-07T15:00:00Z')
const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://jnoyjewsqbooqaiighcs.supabase.co', CRON_SECRET: 's'.repeat(64),
  APP_URL: 'https://rm12-torneos-dev.vercel.app', CONFIRM_SUPABASE_PROJECT_REF: 'jnoyjewsqbooqaiighcs', PRODUCTION_SUPABASE_PROJECT_REF: 'baeylvoipmazcthnwxmz' }
const jobs = ['process-tournaments', 'flow-reconcile', 'reconcile-refunds', 'watchdog'].map(job => ({ job, state: 'healthy', lastSuccessAt: new Date(now - 60_000).toISOString() }))
describe('isolated RM-12 scheduling and independent monitor', () => {
  it('rejects production, an unconfirmed project and the shared alias', () => {
    for (const override of [{ NEXT_PUBLIC_SUPABASE_URL: 'https://baeylvoipmazcthnwxmz.supabase.co' }, { CONFIRM_SUPABASE_PROJECT_REF: '' }, { APP_URL: 'https://torneos-dev.vercel.app' }]) {
      expect(() => buildRm12SchedulerSql({ ...env, ...override })).toThrow()
    }
  })
  it('uses only owned jobs and Vault references, without plaintext credentials', () => {
    const sql = buildRm12SchedulerSql(env)
    expect(sql).not.toContain(env.CRON_SECRET)
    expect(sql).not.toContain('cron.unschedule')
    expect(sql).not.toContain('private.invoke_app_cron')
    expect(sql).toContain("cron.schedule('rm12-watchdog','*/5 * * * *'")
    expect(sql).toContain("cron.schedule('rm12-capture-http'")
  })
  it('reports processing separately while preserving HTTP 503 and NO_GO without alerting', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: false, schedulerHealthy: true, operationalReady: false, notificationsDeferred: true, jobs }, { status: 503 }))
    expect(await checkRm12Monitor(env, fetcher, now)).toMatchObject({ schedulerHealthy: true, operationalReady: false, http: 503, providerCalls: 0, productionDecision: 'NO_GO' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual')
  })
  it.each(['stale', 'future', 'missing', 'error'])('does not accept a claimed healthy scheduler with %s evidence', async mode => {
    const evidence = jobs.map(job => ({ ...job }))
    if (mode === 'missing') evidence.pop()
    else if (mode === 'error') evidence[0].state = 'error'
    else evidence[0].lastSuccessAt = new Date(now + (mode === 'future' ? 120_000 : -900_000)).toISOString()
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, schedulerHealthy: true, operationalReady: true, notificationsDeferred: false, jobs: evidence }))
    expect(await checkRm12Monitor(env, fetcher, now)).toMatchObject({ schedulerHealthy: false, operationalReady: false })
  })
  it('handles network loss without provider calls or credentials in output', async () => {
    const result = await checkRm12Monitor(env, vi.fn().mockRejectedValue(new Error('private response')), now)
    expect(result).toMatchObject({ schedulerHealthy: false, operationalReady: false, reason: 'unreachable' })
    expect(JSON.stringify(result)).not.toContain(env.CRON_SECRET)
  })
})
