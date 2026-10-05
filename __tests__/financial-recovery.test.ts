import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), createRefund: vi.fn(),
  paymentStatus: vi.fn(), paymentByOrder: vi.fn(), heartbeat: vi.fn(), read: { data: null as unknown, error: null as unknown } }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.from }) }))
vi.mock('@/lib/flow/refunds', () => ({ createFlowRefund: h.createRefund, getFlowRefundStatus: vi.fn() }))
vi.mock('@/lib/flow/payments', () => ({ getFlowPaymentStatus: h.paymentStatus, getFlowPaymentStatusByCommerceOrder: h.paymentByOrder }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://fixture.test' }))
vi.mock('@/lib/ops/heartbeat', () => ({ recordHeartbeat: h.heartbeat }))
vi.mock('@/lib/email/tournament-notifications', () => ({ sendTournamentRegistrationEmail: vi.fn() }))
import { dispatchRefund, recordRefundStatus } from '@/lib/flow/refund-worker'
import { reconcileFlowPayment, settleFlowPayment } from '@/lib/flow/settlement'
import { GET as reconcileCron } from '@/app/api/cron/flow-reconcile/route'

const claim = { id: 'refund-1', refund_commerce_order: 'ref-payment-1', receiver_email: 'payer@fixture.test',
  amount_pesos: 5000, commerce_trx_id: 'tour-1', flow_trx_id: 123 }
const refundResponse = { token: 'refund-token', flowRefundOrder: '99', amount: 5000, status: 'created', date: '', fee: 0 }
const paymentResponse = { flowOrder: 123, commerceOrder: 'tour-1', amount: 5000, currency: 'CLP', status: 2 as const,
  payer: 'payer@fixture.test', subject: '', requestDate: '' }
const attempt = { id: 'attempt-1', intent: 'tournament_registration', tournament_id: 't1', user_id: 'u1',
  charged_amount_cents: 500000, flow_order: 123, flow_token: 'token' }
beforeEach(() => {
  vi.resetAllMocks()
  h.rpc.mockResolvedValue({ data: true, error: null })
  h.createRefund.mockResolvedValue(refundResponse)
  h.paymentStatus.mockResolvedValue(paymentResponse); h.paymentByOrder.mockResolvedValue(paymentResponse)
  h.read = { data: attempt, error: null }
  h.from.mockImplementation(() => {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(h.read),
      single: vi.fn().mockResolvedValue(h.read) }
    return q
  })
})
describe('refund response loss and single external dispatch', () => {
  it('requires committed claim before sending a stable order tied to original payment', async () => {
    h.rpc.mockResolvedValueOnce({ data: claim, error: null })
    expect(await dispatchRefund('refund-1')).toEqual({ dispatched: true, token: 'refund-token' })
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.createRefund.mock.invocationCallOrder[0])
    expect(h.createRefund).toHaveBeenCalledWith(expect.objectContaining({ refundCommerceOrder: 'ref-payment-1',
      commerceTrxId: 'tour-1', flowTrxId: 123, amountPesos: 5000 }))
    const nonce = h.rpc.mock.calls[0][1].p_nonce
    expect(h.rpc.mock.calls[1]).toEqual(['record_flow_refund_dispatch', expect.objectContaining({ p_nonce: nonce, p_token: 'refund-token' })])
  })
  it.each([{ data: null, error: null }, { data: null, error: { message: 'claim unavailable' } }])('does not send without claim %j', async result => {
    h.rpc.mockResolvedValueOnce(result)
    try { await dispatchRefund('refund-1') } catch { /* unavailable */ }
    expect(h.createRefund).not.toHaveBeenCalled()
  })
  it('records ambiguous create error as unknown and cannot resend when claim was consumed', async () => {
    h.rpc.mockResolvedValueOnce({ data: claim, error: null })
    h.createRefund.mockRejectedValueOnce(new Error('connection lost after send'))
    expect(await dispatchRefund('refund-1')).toMatchObject({ dispatched: false, error: 'connection lost after send' })
    expect(h.rpc).toHaveBeenCalledWith('record_flow_refund_dispatch', expect.objectContaining({ p_token: null, p_error: 'connection lost after send' }))
    h.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await dispatchRefund('refund-1')).toEqual({ dispatched: false })
    expect(h.createRefund).toHaveBeenCalledTimes(1)
  })
  it('does not send again or discard token when saving successful response fails', async () => {
    h.rpc.mockResolvedValueOnce({ data: claim, error: null }).mockResolvedValueOnce({ error: { message: 'database response lost' } })
    await expect(dispatchRefund('refund-1')).rejects.toThrow('database response lost')
    expect(h.createRefund).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledTimes(2)
    expect(h.rpc.mock.calls[1][1].p_token).toBe('refund-token')
  })
  it('invalid creation response leaves uncertainty rather than successful dispatch', async () => {
    h.rpc.mockResolvedValueOnce({ data: claim, error: null }); h.createRefund.mockResolvedValue({ ...refundResponse, amount: 999 })
    expect(await dispatchRefund('refund-1')).toMatchObject({ dispatched: false, error: expect.any(String) })
  })
  it('validates callback token and unknown status before changing financial state', async () => {
    await expect(recordRefundStatus('r1', 'wrong', refundResponse)).rejects.toThrow('Token')
    await expect(recordRefundStatus('r1', 'refund-token', { ...refundResponse, status: 'surprise' })).rejects.toThrow('desconocido')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('provider created state remains pending and DB persistence errors propagate', async () => {
    h.rpc.mockResolvedValue({ error: { message: 'cannot persist completion' } })
    await expect(recordRefundStatus('r1', 'refund-token', refundResponse)).rejects.toThrow('cannot persist')
    expect(h.rpc).toHaveBeenCalledWith('record_verified_refund', expect.objectContaining({ p_status: 'pending', p_amount_pesos: 5000 }))
  })
})
describe('verified payments never discarded on checkout expiry', () => {
  it('recovers create response loss by the original commerceId, with no second create', async () => {
    h.read.data = { ...attempt, flow_token: null, flow_order: null }
    h.rpc.mockResolvedValue({ data: { idempotent: true, registration_id: 'registration' }, error: null })
    expect(await reconcileFlowPayment('tour-1')).toMatchObject({ credited: true, registrationId: 'registration' })
    expect(h.paymentByOrder).toHaveBeenCalledWith('tour-1')
    expect(h.rpc).toHaveBeenCalledWith('settle_tournament_registration', expect.objectContaining({ p_flow_token: null, p_flow_order: 123 }))
  })
  it('confirmed payment may return a durable refund instead of registration', async () => {
    h.rpc.mockResolvedValue({ data: { idempotent: false, refund_id: 'durable-refund' }, error: null })
    expect(await settleFlowPayment('token')).toMatchObject({ credited: false, refundId: 'durable-refund' })
  })
  it('provider query timeout cannot mark a payment rejected or expired', async () => {
    h.paymentByOrder.mockRejectedValue(new Error('timeout'))
    await expect(reconcileFlowPayment('tour-1')).rejects.toThrow('timeout')
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.from).not.toHaveBeenCalled()
  })
  it('rejects a commerceId lookup returning another order', async () => {
    h.paymentByOrder.mockResolvedValue({ ...paymentResponse, commerceOrder: 'another-order' })
    await expect(reconcileFlowPayment('tour-1')).rejects.toThrow('Orden comercial')
    expect(h.from).not.toHaveBeenCalled()
  })
  it.each([{ amount: 4999 }, { currency: 'USD' }, { flowOrder: 999 }])('rejects mismatched provider proof %j', async mismatch => {
    h.paymentStatus.mockResolvedValue({ ...paymentResponse, ...mismatch })
    await expect(settleFlowPayment('token')).rejects.toThrow('inconsistente'); expect(h.rpc).not.toHaveBeenCalled()
  })
  it('failure to record terminal provider rejection is not success', async () => {
    h.paymentStatus.mockResolvedValue({ ...paymentResponse, status: 3 }); h.rpc.mockResolvedValue({ error: { message: 'write failed' } })
    await expect(settleFlowPayment('token')).rejects.toThrow('write failed')
  })
  it('confirmed unsupported legacy deposit creates an obligation, never wallet credit', async () => {
    h.read.data = { ...attempt, intent: 'wallet_deposit' }; h.rpc.mockResolvedValue({ data: 'manual-obligation', error: null })
    expect(await settleFlowPayment('token')).toMatchObject({ credited: false, refundId: 'manual-obligation' })
    expect(h.rpc).toHaveBeenCalledWith('queue_unsupported_flow_payment_refund', expect.any(Object))
    expect(h.rpc).not.toHaveBeenCalledWith('wallet_insert_transaction', expect.anything())
  })
})
describe('payment reconciliation health', () => {
  it('query errors return 500 and never issue a financial expiry update', async () => {
    vi.stubEnv('CRON_SECRET', 'fixture-secret')
    h.read = { data: [{ commerce_order: 'tour-1', flow_token: null }], error: null }
    h.paymentByOrder.mockRejectedValue(new Error('provider unavailable'))
    const res = await reconcileCron(new Request('https://fixture.test/api/cron/flow-reconcile', { headers: { authorization: 'Bearer fixture-secret' } }))
    expect(res.status).toBe(500); expect(await res.json()).toMatchObject({ ok: false, errors: 1 })
    expect(h.heartbeat).toHaveBeenCalledWith('flow-reconcile', 'error', expect.any(String))
    expect(h.rpc).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
