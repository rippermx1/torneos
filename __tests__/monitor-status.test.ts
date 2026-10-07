import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: h.from }) }))
import { GET } from '@/app/api/cron/monitor-status/route'
const now = new Date('2026-10-07T15:00:00Z')
let rows: Record<string, unknown>[], blocked: number, aged: number, incidents: number, fail: boolean
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'synthetic'); vi.stubEnv('STAGING_PHASE', 'financial')
  vi.useFakeTimers(); vi.setSystemTime(now)
  blocked = aged = incidents = 0; fail = false
  rows = ['process-tournaments','flow-reconcile','reconcile-refunds','watchdog'].map(job_name => ({ job_name, last_run_at: now.toISOString(), last_success_at: now.toISOString(), last_status: 'ok' }))
  h.from.mockImplementation((table: string) => {
    const q = { select: () => q, eq: async () => ({ count: blocked, error: null }),
      in: () => q, lte: async () => ({ count: aged, error: null }), is: async () => ({ count: incidents, error: null }),
      then: (resolve: (r: unknown) => void) => resolve({ data: table === 'cron_heartbeats' ? rows : [], error: fail ? { message: 'read failed' } : null }) }
    return q
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
const request = (auth = true) => new Request('https://fixture.invalid/api/cron/monitor-status', { headers: auth ? { Authorization: 'Bearer synthetic' } : {} })
describe('independent read-only operational signal', () => {
  it('rejects unauthorized calls before reading private operational data', async () => {
    h.from.mockClear(); expect((await GET(request(false))).status).toBe(401); expect(h.from).not.toHaveBeenCalled()
  })
  it('reports fresh processing and a ready operation with no cache', async () => {
    const r = await GET(request()); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toMatchObject({ ok: true, schedulerHealthy: true, operationalReady: true })
  })
  it('does not turn blocked staging into financial readiness', async () => {
    vi.stubEnv('STAGING_PHASE', 'configuration')
    const r = await GET(request()); expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ schedulerHealthy: true, operationalReady: false, notificationsDeferred: true })
  })
  it.each(['missing','stale','future','error'])('a fresh watchdog cannot hide %s worker evidence', async mode => {
    if (mode === 'missing') rows.shift()
    else if (mode === 'error') rows[0].last_status = 'error'
    else rows[0].last_success_at = new Date(now.getTime() + (mode === 'future' ? 120_000 : -900_000)).toISOString()
    const r = await GET(request()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ schedulerHealthy: false })
  })
  it('unresolved incidents or notifications prevent readiness even with healthy jobs', async () => {
    for (const kind of ['incident','blocked','aged']) {
      incidents = kind === 'incident' ? 1 : 0; blocked = kind === 'blocked' ? 1 : 0; aged = kind === 'aged' ? 1 : 0
      expect((await GET(request())).status).toBe(503)
    }
  })
  it('a failed DB read is not an empty healthy system', async () => {
    fail = true; const r = await GET(request()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ schedulerHealthy: false })
  })
})
