import { describe, it, expect, beforeEach, vi } from 'vitest'

// Regresión del bug crítico de lanzamiento: la cancelación de torneos no
// reembolsaba porque issueFlowRefunds filtraba por status='credited' mientras
// settle_tournament_registration escribe 'paid'. Estos tests fijan el contrato:
//  1. Se reembolsan los pagos con status='paid'.
//  2. Idempotencia: no se reemite reversa para un pago que ya tiene una.

const h = vi.hoisted(() => ({
  adminStub: null as unknown as ReturnType<typeof buildAdminStub>,
  createFlowRefundMock: vi.fn(),
  sendCancelledEmailMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => h.adminStub }))
vi.mock('@/lib/flow/refunds', () => ({
  createFlowRefund: (...args: unknown[]) => h.createFlowRefundMock(...args),
  getFlowRefundStatus: vi.fn(),
}))
vi.mock('@/lib/email/refund-notifications', () => ({
  sendTournamentCancelledEmail: (...args: unknown[]) => h.sendCancelledEmailMock(...args),
}))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://www.torneosplay.cl' }))

import { issueFlowRefunds } from '@/lib/tournament/refunds'

interface AttemptRow {
  id: string
  user_id: string
  commerce_order: string
  flow_order: number | null
}

// Stub encadenable mínimo del cliente Supabase admin, suficiente para
// issueFlowRefunds. Registra los filtros de status aplicados a
// flow_payment_attempts para poder aseverar que consulta 'paid'.
function buildAdminStub(opts: {
  paidAttempts: AttemptRow[]
  existingRefunds: { flow_payment_attempt_id: string }[]
  users: Record<string, { email: string; user_metadata?: Record<string, unknown> }>
}) {
  const statusFilters: string[] = []

  const from = (table: string) => {
    const builder = {
      _mode: 'select' as 'select' | 'insert',
      select() { this._mode = 'select'; return this },
      insert() { this._mode = 'insert'; return this },
      eq(col: string, val: string) {
        if (table === 'flow_payment_attempts' && col === 'status') statusFilters.push(val)
        return this
      },
      then(resolve: (v: unknown) => unknown) {
        let result: unknown = { data: null, error: null }
        if (this._mode === 'insert') result = { error: null }
        else if (table === 'flow_payment_attempts') result = { data: opts.paidAttempts }
        else if (table === 'flow_refund_attempts') result = { data: opts.existingRefunds }
        return Promise.resolve(result).then(resolve)
      },
    }
    return builder
  }

  return {
    statusFilters,
    from,
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({
            data: { user: opts.users[id] ?? null },
            error: opts.users[id] ? null : new Error('no user'),
          }),
      },
    },
  }
}

beforeEach(() => {
  h.createFlowRefundMock.mockReset()
  h.sendCancelledEmailMock.mockReset()
  h.createFlowRefundMock.mockResolvedValue({ token: 'refund-token', flowRefundOrder: '999' })
  h.sendCancelledEmailMock.mockResolvedValue(undefined)
})

describe('issueFlowRefunds', () => {
  it('emite reembolsos para los pagos con status=paid (no credited)', async () => {
    h.adminStub = buildAdminStub({
      paidAttempts: [
        { id: 'a1', user_id: 'u1', commerce_order: 'tour-1', flow_order: 111 },
        { id: 'a2', user_id: 'u2', commerce_order: 'tour-2', flow_order: 222 },
      ],
      existingRefunds: [],
      users: {
        u1: { email: 'u1@example.cl', user_metadata: { username: 'uno' } },
        u2: { email: 'u2@example.cl', user_metadata: { username: 'dos' } },
      },
    })

    const results = await issueFlowRefunds('t1', 100000, 'https://www.torneosplay.cl', 'Torneo Uno')

    // Fija la causa raíz: la consulta debe filtrar por 'paid', nunca 'credited'.
    expect(h.adminStub.statusFilters).toContain('paid')
    expect(h.adminStub.statusFilters).not.toContain('credited')

    expect(h.createFlowRefundMock).toHaveBeenCalledTimes(2)
    expect(results).toHaveLength(2)
    expect(results.every((r) => !r.error)).toBe(true)
    expect(results.map((r) => r.userId).sort()).toEqual(['u1', 'u2'])
  })

  it('es idempotente: no reembolsa un pago que ya tiene una reversa', async () => {
    h.adminStub = buildAdminStub({
      paidAttempts: [
        { id: 'a1', user_id: 'u1', commerce_order: 'tour-1', flow_order: 111 },
        { id: 'a2', user_id: 'u2', commerce_order: 'tour-2', flow_order: 222 },
      ],
      existingRefunds: [{ flow_payment_attempt_id: 'a1' }], // a1 ya reembolsado
      users: {
        u1: { email: 'u1@example.cl' },
        u2: { email: 'u2@example.cl' },
      },
    })

    const results = await issueFlowRefunds('t1', 100000, 'https://www.torneosplay.cl', 'Torneo Uno')

    expect(h.createFlowRefundMock).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
    expect(results[0]!.userId).toBe('u2')
  })
})
