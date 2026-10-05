import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), upload: vi.fn(), remove: vi.fn(), mfa: vi.fn(), status: 'transferring', moveCount: 2, movesError: false, incomplete: false }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.from, storage: { from: () => ({ upload: h.upload, remove: h.remove }) } }) }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfaForApi: h.mfa }))
vi.mock('@/lib/admin/audit', () => ({ recordAdminAction: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/email/withdrawal-notifications', () => ({ sendWithdrawalApprovedEmail: vi.fn(), sendWithdrawalRejectedEmail: vi.fn() }))
import { POST as prize } from '@/app/api/admin/prize-reviews/[id]/route'
import { POST as hold } from '@/app/api/admin/financial-holds/route'
import { POST as claim } from '@/app/api/admin/payouts/[id]/claim/route'
import { POST as begin } from '@/app/api/admin/payouts/[id]/begin/route'
import { POST as complete } from '@/app/api/admin/payouts/[id]/complete/route'
import { POST as reconcile } from '@/app/api/admin/payouts/[id]/reconcile/route'
import { POST as approve } from '@/app/api/admin/payouts/[id]/approve/route'
import { POST as reject } from '@/app/api/admin/payouts/[id]/reject/route'
import { POST as resolve } from '@/app/api/admin/disputes/[id]/resolve/route'
import { loadPrizeEvidence } from '@/lib/payouts/review'
import { createAdminClient } from '@/lib/supabase/server'

const id = 'a75839a0-bc68-4482-b943-f251fc7f71a0'
const user = '35790cc2-31ae-4ee5-8a78-b3117a86766d'
const params = { params: Promise.resolve({ id }) }
const json = (body: unknown) => new Request('https://fixture.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const multipart = (outcome = 'unknown') => {
  const body = new FormData()
  body.set('outcome', outcome); body.set('notes', 'Cartola y banco verificados'); body.set('transferReference', 'BANK-123')
  body.set('evidence', new File(['%PDF-1.7\nfixture'], 'proof.pdf', { type: 'application/pdf' }))
  return new Request('https://fixture.invalid', { method: 'POST', body })
}
beforeEach(() => {
  vi.resetAllMocks(); h.status = 'transferring'; h.moveCount = 2; h.movesError = false; h.incomplete = false
  h.mfa.mockResolvedValue({ ok: true, access: { userId: 'operator' } })
  h.rpc.mockResolvedValue({ data: 'receipt', error: null }); h.upload.mockResolvedValue({ error: null })
  h.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ error: null, data: table === 'prize_reviews' ? { user_id: user, tournament_id: id }
      : table === 'games' ? { id, status: 'completed', move_count: h.moveCount, final_score: 128 }
      : table === 'profiles' ? { kyc_status: 'approved', full_name: 'Persona Prueba', rut: '12.345.678-5' }
      : { id, status: h.status, claimed_by: 'operator', user_id: user, amount_cents: 500000, account_holder: 'Persona Prueba', account_rut: '12.345.678-5', bank_name: 'Banco' } }),
    range: vi.fn().mockImplementation((start: number, end: number) => ({ error: h.movesError ? { message: 'failed' } : null,
      data: Array.from({ length: Math.max(0, Math.min(end - start + 1, h.moveCount - (h.incomplete ? 1 : 0) - start)) }, (_, n) => ({ server_timestamp: new Date(1700000000000 + (start + n) * 500).toISOString() })) })),
  }))
})
describe('RM08 administrative financial boundary', () => {
  it.each([prize, claim, begin, complete, reconcile, approve, reject, resolve])('requires MFA before DB or proof access', async handler => {
    h.mfa.mockResolvedValue({ ok: false, response: Response.json({ error: 'MFA' }, { status: 403 }) })
    expect((await handler(json({}), params)).status).toBe(403)
    expect(h.from).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled()
  })
  it('requires MFA for account holds', async () => {
    h.mfa.mockResolvedValue({ ok: false, response: Response.json({}, { status: 403 }) })
    expect((await hold(json({}))).status).toBe(403); expect(h.rpc).not.toHaveBeenCalled()
  })
  it('retains every award even when 500ms bot-like cadence produces zero flags', async () => {
    h.moveCount = 35
    expect((await prize(json({ decision: 'approved', reason: 'Partida e identidad revisadas por operador' }), params)).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('review_prize', expect.objectContaining({ p_admin_id: 'operator', p_evidence: expect.objectContaining({ flags: [] }) }))
    // Human decision is explicit; no threshold/empty-flags automatic RPC.
  })
  it.each(['read error', 'incomplete count'])('cannot release prize with %s', async mode => {
    h.movesError = mode === 'read error'; h.incomplete = mode === 'incomplete count'
    expect((await prize(json({ decision: 'approved', reason: 'Evidencia revisada manualmente' }), params)).status).toBe(422)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('reads beyond first 1000 stored moves before approval', async () => {
    h.moveCount = 1201
    const evidence = await loadPrizeEvidence(createAdminClient(), id, user)
    expect(evidence.games[0].moveCount).toBe(1201)
    expect(h.from.mock.calls.filter(c => c[0] === 'game_moves')).toHaveLength(3)
  })
  it('hold can be applied even when game evidence is unavailable', async () => {
    h.movesError = true
    expect((await prize(json({ decision: 'held', reason: 'Revisión de disputa pendiente' }), params)).status).toBe(200)
    expect(h.from).not.toHaveBeenCalledWith('game_moves')
  })
  it('begin returns uncertainty after lost commit response and never compensates', async () => {
    h.rpc.mockRejectedValue(new Error('lost after commit'))
    const res = await begin(json({}), params)
    expect(res.status).toBe(503); expect((await res.json()).error).toContain('no transfieras nuevamente')
    expect(h.rpc.mock.calls.map(c => c[0])).toEqual(['begin_withdrawal_transfer'])
  })
  it('rejecting started transfer is blocked before refund RPC', async () => {
    expect((await reject(json({ notes: 'No devolver fondos inciertos' }), params)).status).toBe(409)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('legacy approval without a responsible operator cannot authorize', async () => {
    h.status = 'pending'
    expect((await approve(json({ notes: 'Importe y destino verificados' }), params)).status).toBe(409)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('fresh hold SQL rejection is surfaced as locked after HTTP checks', async () => {
    h.status = 'claimed'; h.rpc.mockResolvedValue({ error: { code: 'PT423', message: 'Pago retenido' } })
    expect((await approve(json({ notes: 'Importe y destino verificados' }), params)).status).toBe(423)
  })
  it('proof survives lost completion response and content hash is stable on retry', async () => {
    h.rpc.mockRejectedValueOnce(new Error('lost commit response'))
    expect((await complete(multipart(), params)).status).toBe(503)
    const path = h.upload.mock.calls[0][0]
    expect(path).toMatch(new RegExp(`^${id}/[0-9a-f]{64}\\.pdf$`))
    expect(h.remove).not.toHaveBeenCalled()
    h.upload.mockResolvedValue({ error: { statusCode: '409', message: 'The resource already exists' } })
    expect((await complete(multipart(), params)).status).toBe(200)
    expect(h.upload.mock.calls[1][0]).toBe(path)
    expect(h.rpc.mock.calls[1][1].p_proof_storage_path).toBe(path)
  })
  it('database duplicate bank reference preserves evidence and demands reconciliation', async () => {
    h.rpc.mockResolvedValue({ error: { code: '23505', message: 'duplicate bank ref' } })
    expect((await complete(multipart(), params)).status).toBe(409); expect(h.remove).not.toHaveBeenCalled()
  })
  it('non-claimant cannot complete payout via normal path', async () => {
    h.mfa.mockResolvedValue({ ok: true, access: { userId: 'second' } })
    expect((await complete(multipart(), params)).status).toBe(409); expect(h.upload).not.toHaveBeenCalled()
  })
  it('responsible operator cannot attest paid/not sent during reconciliation', async () => {
    expect((await reconcile(multipart('not_sent'), params)).status).toBe(409)
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.upload).not.toHaveBeenCalled()
  })
  it('unknown outcome retains payout without evidence upload or refund', async () => {
    expect((await reconcile(multipart('unknown'), params)).status).toBe(200)
    expect(h.upload).not.toHaveBeenCalled()
    expect(h.rpc).toHaveBeenCalledWith('reconcile_withdrawal', expect.objectContaining({ p_outcome: 'unknown', p_proof_path: null }))
  })
  it('second operator bank reconciliation stores proof and retains it on uncertain commit', async () => {
    h.mfa.mockResolvedValue({ ok: true, access: { userId: 'second' } }); h.rpc.mockRejectedValue(new Error('lost'))
    expect((await reconcile(multipart('paid'), params)).status).toBe(503); expect(h.remove).not.toHaveBeenCalled()
  })
  it('dispute resolution goes through authoritative audit RPC; missing dispute is not success', async () => {
    h.rpc.mockResolvedValue({ error: { code: 'PT404', message: 'Disputa no encontrada' } })
    expect((await resolve(json({ resolution: 'resolved', notes: 'Partida y resultados verificados' }), params)).status).toBe(404)
    expect(h.rpc).toHaveBeenCalledWith('resolve_financial_dispute', expect.objectContaining({ p_admin_id: 'operator' }))
  })
})
