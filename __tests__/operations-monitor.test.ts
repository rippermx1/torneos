import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn(), resolve: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.from }) }))
vi.mock('@/lib/email/ops-notifications', () => ({ resolveOpsAlertEmail: h.resolve }))
vi.mock('@/lib/email/operational', async importOriginal => ({ ...await importOriginal<object>(), sendOperationalEmail: h.send }))
import { runOperationalMonitor, loadOperationalDashboard } from '@/lib/ops/monitor'
import { OperationalEmailError } from '@/lib/email/operational'

const snapshot = { observed_at: new Date().toISOString(), bank_cash_verified: false, active_incidents: 1, jobs: [], queues: Array.from({ length: 7 }, (_, n) => ({ key: `queue-${n}`, title: 'Queue', href: '/admin/operations', count: 0, amount_cents: 0, oldest_at: null })), checks: Array.from({ length: 5 }, (_, n) => ({ key: `check-${n}`, title: 'Check', href: '/admin/operations', count: 0, amount_cents: 0 })) }
const notification = { id: 'stable-id', claim_token: 'claim-token', recipient: 'ops@example.test', text_body: 'Immutable', subject: 'Alert' }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('OPS_ESCALATION_EMAIL', 'backup@example.test')
  h.resolve.mockResolvedValue('ops@example.test');h.send.mockResolvedValue('provider-id')
  h.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'observe_operations' ? snapshot : name === 'claim_ops_notifications' ? [notification] : {} }))
  h.from.mockReturnValue({ select: () => ({ not: async () => ({ count: 0, error: null }) }) })
})
afterEach(() => vi.unstubAllEnvs())
describe('durable operational monitor boundary', () => {
  it('provider acceptance is persisted after observation and before claiming success', async () => {
    const result = await runOperationalMonitor()
    expect(result).toMatchObject({ accepted: 1, failed: 0, snapshot: { active_incidents: 1 } })
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['observe_operations', 'claim_ops_notifications', 'finish_ops_notification'])
    expect(h.rpc.mock.calls[0][1]).toEqual({ p_recipient: 'ops@example.test', p_escalation_recipient: 'backup@example.test' })
    expect(h.rpc.mock.calls[2][1]).toMatchObject({ p_provider_id: 'provider-id', p_token: 'claim-token' })
  })
  it.each(['observe_operations', 'claim_ops_notifications', 'finish_ops_notification'])('DB failure in %s never reports success', async name => {
    h.rpc.mockImplementation(async (method: string) => method === name ? { error: { message: 'database unavailable' }, data: null } : { error: null, data: method === 'observe_operations' ? snapshot : [notification] })
    await expect(runOperationalMonitor()).rejects.toThrow()
    if (name === 'observe_operations') expect(h.send).not.toHaveBeenCalled()
  })
  it('a lost send response persists uncertainty without another inline send', async () => {
    h.send.mockRejectedValue(new Error('timeout after acceptance'))
    expect(await runOperationalMonitor()).toMatchObject({ failed: 1, accepted: 0 })
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_provider_id: null, p_retryable: true, p_error: 'timeout after acceptance' })
  })
  it('permanent provider rejection is visible and blocked', async () => {
    h.send.mockRejectedValue(new OperationalEmailError('Provider 403', false))
    await runOperationalMonitor()
    expect(h.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_provider_id: null, p_retryable: false })
  })
  it('failed pending notification count never appears as zero', async () => {
    h.from.mockReturnValue({ select: () => ({ not: async () => ({ count: null, error: { message: 'failed' } }) }) })
    await expect(runOperationalMonitor()).rejects.toThrow('trabajo de notificación')
  })
  it('partial dashboard read is unavailable rather than a healthy empty page', async () => {
    const query = { error: { message: 'failed' }, data: [], select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis() }
    h.from.mockReturnValue(query)
    await expect(loadOperationalDashboard()).rejects.toThrow('incompleta')
  })
})
