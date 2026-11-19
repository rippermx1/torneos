import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const h = vi.hoisted(() => ({ load: vi.fn(), mfa: vi.fn() }))
vi.mock('@/lib/cash/server', () => ({ loadCashDashboard: h.load }))
vi.mock('@/lib/supabase/admin-mfa', () => ({ requireAdminMfa: h.mfa }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import CashPage from '@/app/(admin)/admin/cash/page'
beforeEach(() => {
  vi.resetAllMocks(); h.mfa.mockResolvedValue({ userId: 'operator' })
  h.load.mockResolvedValue({ status: { observed_at: '2026-10-05T12:00:00Z', exposure_cents: 500000, required_reserve_cents: 600000, wallet_cents: 0, uncredited_prizes_cents: 0, reserved_withdrawals_cents: 0, promised_prizes_cents: 500000, refunds_cents: 0, unsettled_payments_cents: 0, tax_reserve_cents: 100000, bank_book_cents: 500000, flow_book_cents: 5000000, available_bank_cents: null, shortfall_cents: null, reconciliation_id: null, reconciliation_at: null, additional_reserve_cents: null, max_exposure_cents: null, paused: true, admissions_allowed: false, blocking_reasons: ['Conciliación pendiente'], open_differences: 0 }, movements: [], reconciliations: [], differences: [], events: [], operators: [] })
})
describe('cash operations page', () => {
  it('shows missing coverage and distinguishes Flow, held funds and accounting from bank', async () => {
    const html = renderToStaticMarkup(await CashPage())
    expect(html).toContain('Nuevos cobros pagados bloqueados'); expect(html).toContain('Sin comprobar'); expect(html).toContain('Flow no cuenta como cobertura bancaria'); expect(html).toContain('estas acciones no ejecutan transferencias')
  })
  it('source failure does not show zero liabilities or allow payments', async () => {
    h.load.mockRejectedValue(new Error('database unavailable'))
    const html = renderToStaticMarkup(await CashPage()); expect(html).toContain('Caja sin comprobar'); expect(html).not.toContain('Cobertura suficiente')
  })
  it('MFA rejection happens before privileged data access', async () => {
    h.mfa.mockRejectedValue(new Error('MFA required')); await expect(CashPage()).rejects.toThrow('MFA required'); expect(h.load).not.toHaveBeenCalled()
  })
  it('provides assignment and independent correction, without a direct resolve checkbox', async () => {
    const data = await h.load(); data.differences = [{ id: 'difference', source: 'flow', difference_cents: 10000, assigned_to: 'operator', due_at: '2026-10-06T12:00:00Z', reconciliation_id: 'cut', reason: 'Comisión por comprobar' }]; h.load.mockResolvedValue(data)
    const html = renderToStaticMarkup(await CashPage()); expect(html).toContain('Corregir comisiones Flow'); expect(html).toContain('nuevo corte aprobado'); expect(html).toContain('Responsable:'); expect(html).toContain('Vence')
  })
})
