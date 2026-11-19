import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), dispatch: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.from }) }))
vi.mock('@/lib/flow/refund-worker', () => ({ dispatchRefund: h.dispatch, dispatchQueuedRefunds: vi.fn(), reconcileRefund: vi.fn() }))
import { issueFlowRefunds } from '@/lib/tournament/refunds'
function rows(data: unknown[], error: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }) }
  h.from.mockReturnValue(query)
  return query
}
beforeEach(() => { vi.resetAllMocks(); h.rpc.mockResolvedValue({ data: 1, error: null }); h.dispatch.mockResolvedValue({ dispatched: true, token: 'provider' }) })
describe('durable cancelled tournament refund dispatch', () => {
  it('records/reuses obligations before sending and uses the stored payment amount', async () => {
    const q = rows([{ id: 'r1', user_id: 'u1', receiver_email: 'payer@fixture.test', amount_cents: 500000, refund_commerce_order: 'ref-payment' }])
    const result = await issueFlowRefunds('t1', 999999, 'https://fixture.test')
    expect(h.rpc).toHaveBeenCalledWith('queue_tournament_refunds', { p_tournament_id: 't1' })
    expect(q.eq).toHaveBeenCalledWith('status', 'queued')
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.dispatch.mock.invocationCallOrder[0])
    expect(result[0].amountCents).toBe(500000)
    expect(h.dispatch).toHaveBeenCalledWith('r1', 'https://fixture.test')
  })
  it('cannot send after obligation persistence failure', async () => {
    h.rpc.mockResolvedValue({ error: { message: 'DB unavailable' } })
    await expect(issueFlowRefunds('t1', 500000, 'https://fixture.test')).rejects.toThrow('DB unavailable')
    expect(h.dispatch).not.toHaveBeenCalled()
  })
  it('cannot send after failed queue query', async () => {
    rows([], { message: 'read failed' })
    await expect(issueFlowRefunds('t1', 500000, 'https://fixture.test')).rejects.toThrow('read failed')
    expect(h.dispatch).not.toHaveBeenCalled()
  })
  it('does not report another workers claim as a new refund', async () => {
    rows([{ id: 'r1', amount_cents: 500000 }]); h.dispatch.mockResolvedValue({ dispatched: false })
    expect(await issueFlowRefunds('t1', 500000, 'https://fixture.test')).toEqual([])
  })
  it('exposes uncertainty instead of claiming refund success', async () => {
    rows([{ id: 'r1', amount_cents: 500000 }]); h.dispatch.mockResolvedValue({ dispatched: false, error: 'response lost' })
    expect((await issueFlowRefunds('t1', 500000, 'https://fixture.test'))[0].error).toBe('response lost')
  })
})
