import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCashCLP, assertCashStatus } from '@/lib/cash/model'

const h = vi.hoisted(() => ({ mfa: vi.fn(), rpc: vi.fn(), upload: vi.fn(), signed: vi.fn(), storage: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: h.mfa }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.from, storage: { from: h.storage } }) }))
import { POST } from '@/app/api/admin/cash/route'
import { GET } from '@/app/api/admin/cash/proof/route'
import { loadCashDashboard } from '@/lib/cash/server'

const id = '10000000-0000-0000-0000-000000000001'
const pdf = () => new File(['%PDF-1.7\nfixture'], 'bank.pdf', { type: 'application/pdf' })
const request = (action: string, extra: Record<string, string | File> = {}) => {
  const form = new FormData()
  for (const [key, value] of Object.entries({ id, action, note: 'Cartolas verificadas por operador', ...extra })) form.set(key, value)
  return new Request('https://fixture.invalid/api/admin/cash', { method: 'POST', body: form })
}
const status = () => ({ observed_at: '2026-10-05T12:00:00Z', exposure_cents: 100, required_reserve_cents: 100, wallet_cents: 100, uncredited_prizes_cents: 0, reserved_withdrawals_cents: 0, promised_prizes_cents: 0, refunds_cents: 0, unsettled_payments_cents: 0, tax_reserve_cents: 0, bank_book_cents: 100, flow_book_cents: 0, negative_wallets: 0, integrity_failures: 0, available_bank_cents: 100, shortfall_cents: 0, reconciliation_id: id, reconciliation_at: '2026-10-05T12:00:00Z', additional_reserve_cents: 0, max_exposure_cents: 10000, paused: false, admissions_allowed: true, blocking_reasons: [], open_differences: 0 })
beforeEach(() => {
  vi.resetAllMocks(); h.mfa.mockResolvedValue({ ok: true, access: { userId: 'session-operator' } })
  h.rpc.mockResolvedValue({ data: id, error: null }); h.upload.mockResolvedValue({ error: null }); h.signed.mockResolvedValue({ data: { signedUrl: 'https://fixture.invalid/private-token' }, error: null })
  h.storage.mockReturnValue({ upload: h.upload, createSignedUrl: h.signed })
  const query = { select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) }
  h.from.mockReturnValue(query)
})
describe('RM10 cash input and administrative boundary', () => {
  it.each(['1.5', '-1', '+1', '1e3', '1,000', ' 1', '', '9000000000001', 'Infinity'])('rejects ambiguous CLP %s', value => expect(() => parseCashCLP(value)).toThrow())
  it('converts whole pesos exactly, including zero reserve and maximum safe policy', () => { expect(parseCashCLP('0')).toBe(0); expect(parseCashCLP('5000')).toBe(500000); expect(parseCashCLP('9000000000000')).toBe(900000000000000) })
  it.each(['record', 'capture', 'approve', 'review', 'difference', 'flow_fees', 'reject', 'policy'])('requires MFA before %s or proof access', async action => {
    h.mfa.mockResolvedValue({ ok: false, response: Response.json({}, { status: 403 }) })
    expect((await POST(request(action))).status).toBe(403); expect(h.rpc).not.toHaveBeenCalled(); expect(h.storage).not.toHaveBeenCalled()
  })
  it('requires MFA for signed proof URLs', async () => {
    h.mfa.mockResolvedValue({ ok: false, response: Response.json({}, { status: 403 }) })
    expect((await GET(new Request('https://fixture.invalid/api/admin/cash/proof?path=anything'))).status).toBe(403); expect(h.rpc).not.toHaveBeenCalled()
  })
  it('uses session actor, immutable evidence and CLP conversion to record a fact', async () => {
    const response = await POST(request('record', { actor: 'forged-owner', kind: 'funding', amount: '5000', reference: 'BANK-1', date: '2026-10-05T08:00:00-03:00', proof: pdf() }))
    expect(response.status).toBe(200); expect(h.rpc).toHaveBeenCalledWith('record_cash_movement', expect.objectContaining({ p_actor: 'session-operator', p_amount: 500000, p_occurred_at: '2026-10-05T11:00:00.000Z', p_id: id, p_proof: expect.stringMatching(new RegExp(`^${id}/[a-f0-9]{64}\\.pdf$`)) }))
    expect(h.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array), { contentType: 'application/pdf', upsert: false })
  })
  it('captures bank and Flow separately and prevents held balances over total', async () => {
    const fields = { bank: '5000', held: '200', flow: '3000', flowHeld: '1000', date: '2026-10-05T08:00:00Z', proof: pdf(), flowProof: pdf() }
    expect((await POST(request('capture', fields))).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('capture_cash_reconciliation', expect.objectContaining({ p_bank: 500000, p_bank_held: 20000, p_flow: 300000, p_flow_held: 100000 }))
    h.rpc.mockClear(); h.upload.mockClear(); expect((await POST(request('capture', { ...fields, held: '5001' }))).status).toBe(400); expect(h.rpc).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled()
  })
  it('same proof retry reuses hash without replacing uploaded bytes', async () => {
    const fields = { kind: 'funding', amount: '5000', reference: 'BANK-1', date: '2026-10-05T08:00:00Z', proof: pdf() }
    await POST(request('record', fields)); const path = h.upload.mock.calls[0][0]
    h.upload.mockResolvedValue({ error: { statusCode: '409' } }); expect((await POST(request('record', fields))).status).toBe(200); expect(h.upload.mock.calls[1][0]).toBe(path)
  })
  it('spoofed MIME bytes are rejected before upload or financial RPC', async () => {
    const response = await POST(request('record', { kind: 'funding', amount: '5000', reference: 'BANK-1', date: '2026-10-05T08:00:00Z', proof: new File(['not a PDF'], 'fake.pdf', { type: 'application/pdf' }) }))
    expect(response.status).toBe(400); expect(h.upload).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled()
  })
  it('lost database response remains uncertain and retains proof and operation identifier', async () => {
    h.rpc.mockRejectedValue(new Error('connection lost'))
    const response = await POST(request('record', { kind: 'funding', amount: '5000', reference: 'BANK-1', date: '2026-10-05T08:00:00Z', proof: pdf() }))
    expect(response.status).toBe(503); expect(await response.json()).toHaveProperty('error', expect.stringContaining('mismo identificador')); expect(h.upload).toHaveBeenCalledOnce()
  })
  it.each(['PT403', 'PT409', 'PT422', '23505', 'XX000'])('surfaces controlled RPC %s without claiming a bank transfer', async code => {
    h.rpc.mockResolvedValue({ error: { code, message: 'Rejected' } })
    expect((await POST(request('approve'))).status).toBe(code === '23505' ? 409 : code === 'XX000' ? 503 : Number(code.slice(2)))
  })
  it('uses approved replacement to resolve differences and assignee/due date to assign', async () => {
    expect((await POST(request('difference', { replacement: id }))).status).toBe(200)
    expect(h.rpc).toHaveBeenLastCalledWith('manage_cash_difference', expect.objectContaining({ p_replacement: id, p_assignee: null, p_due_at: null }))
    expect((await POST(request('difference', { assignee: id, due: '2026-10-06T12:00:00Z' }))).status).toBe(200)
    expect(h.rpc).toHaveBeenLastCalledWith('manage_cash_difference', expect.objectContaining({ p_replacement: null, p_assignee: id }))
  })
  it('requires an explicit independent commission decision with a session actor', async () => {
    expect((await POST(request('flow_fees', { actor: 'forged-owner' }))).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('correct_flow_fee_difference', expect.objectContaining({ p_id: id, p_actor: 'session-operator' }))
  })
  it('audits access before issuing private 60-second URLs with no cache', async () => {
    h.rpc.mockResolvedValue({ data: `${id}/proof.pdf`, error: null })
    const response = await GET(new Request(`https://fixture.invalid/api/admin/cash/proof?path=${id}/proof.pdf`))
    expect(h.rpc).toHaveBeenCalledWith('read_cash_proof', { p_actor: 'session-operator', p_path: `${id}/proof.pdf` }); expect(h.signed).toHaveBeenCalledWith(`${id}/proof.pdf`, 60)
    expect(response.status).toBe(303); expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('never signs an unrecorded or unauthorized proof', async () => { h.rpc.mockResolvedValue({ data: null, error: { code: 'PT404' } }); expect((await GET(new Request('https://fixture.invalid/api/admin/cash/proof?path=orphan'))).status).toBe(404); expect(h.signed).not.toHaveBeenCalled() })
})
describe('cash dashboard cannot equate an unavailable source to zero', () => {
  it('rejects incomplete, unsafe and internally contradictory status payloads', () => {
    expect(() => assertCashStatus(status())).not.toThrow()
    for (const value of [{}, { ...status(), exposure_cents: Number.MAX_SAFE_INTEGER + 1 }, { ...status(), admissions_allowed: true, blocking_reasons: ['blocked'] }, { ...status(), wallet_cents: -100 }, { ...status(), available_bank_cents: null }, { ...status(), exposure_cents: 200 }]) expect(() => assertCashStatus(value)).toThrow()
  })
  it('rejects any failed query including audit and operator sources', async () => {
    h.rpc.mockResolvedValue({ data: status(), error: null }); h.from.mockReturnValue({ select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }), limit: vi.fn().mockResolvedValue({ data: [], error: null }) })
    await expect(loadCashDashboard()).rejects.toThrow('No se pudo comprobar')
  })
  it('returns a complete snapshot without adding display page totals', async () => { h.rpc.mockResolvedValue({ data: status(), error: null }); const data = await loadCashDashboard(); expect(data.status.exposure_cents).toBe(100); expect(data.movements).toEqual([]) })
})
