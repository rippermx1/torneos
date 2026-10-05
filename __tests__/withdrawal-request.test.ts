import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.from }) }))
vi.mock('@/lib/supabase/auth', () => ({ requireAnyRoleForApi: async () => ({ ok: true, access: { userId: 'u1' } }) }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }), getRequestIp: () => 'fixture', rateLimitResponse: vi.fn() }))
import { POST } from '@/app/api/wallet/withdraw/request/route'
const id = 'a75839a0-bc68-4482-b943-f251fc7f71a0'
const payload = { requestId: id, amountCents: 500000, bankName: 'Banco', bankAccount: '123', accountRut: '12.345.678-5', accountHolder: 'Persona Prueba' }
const request = (body: unknown = payload) => new Request('https://fixture.test/api/wallet/withdraw/request', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
beforeEach(() => {
  vi.resetAllMocks()
  h.rpc.mockResolvedValue({ data: id, error: null })
  h.from.mockImplementation(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { kyc_status: 'approved', rut: '12.345.678-5', full_name: 'Persona Prueba' }, error: null }) }))
})
describe('atomic withdrawal request route', () => {
  it('repeated submission carries the same request key and locked identity snapshot to one RPC', async () => {
    expect((await POST(request())).status).toBe(200); expect((await POST(request())).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledTimes(2)
    for (const [name, args] of h.rpc.mock.calls) {
      expect(name).toBe('request_withdrawal')
      expect(args).toMatchObject({ p_request_id: id, p_user_id: 'u1', p_verified_full_name: 'Persona Prueba', p_amount_cents: 500000 })
    }
    expect(h.from).toHaveBeenCalledWith('profiles')
    expect(h.from).not.toHaveBeenCalledWith('withdrawal_requests')
  })
  it('lost RPC response returns uncertainty without compensatory credit or a new ID', async () => {
    h.rpc.mockRejectedValueOnce(new Error('response lost after commit'))
    expect((await POST(request())).status).toBe(503)
    expect((await POST(request())).status).toBe(200)
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['request_withdrawal', 'request_withdrawal'])
    expect(h.rpc.mock.calls[0][1].p_request_id).toBe(h.rpc.mock.calls[1][1].p_request_id)
  })
  it.each([null, [], { ...payload, requestId: undefined }, { ...payload, bankName: 1 }, { ...payload, amountCents: 500001 }])('rejects invalid input %j without mutations', async value => {
    expect((await POST(request(value))).status).toBe(400); expect(h.rpc).not.toHaveBeenCalled()
  })
  it('reports database conflict without attempting to restore an unrelated debit', async () => {
    h.rpc.mockResolvedValue({ error: { code: 'PT409', message: 'Identificador usado con otros datos' } })
    expect((await POST(request())).status).toBe(409); expect(h.rpc).toHaveBeenCalledTimes(1)
  })
})
