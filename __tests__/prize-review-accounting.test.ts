import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { accountingReportToCsv, buildModeloAAccountingReport } from '@/lib/accounting/model-a-report'

const review = { id: 'r', user_id: 'u', tournament_id: 't', amount_cents: 1000000, status: 'held', created_at: '2026-08-10T16:00:00Z' }
function client(tables: Record<string, unknown[]>) {
  return { rpc: async () => ({ data: { lines: [], accounts: [] }, error: null }), from: (name: string) => ({ select() { return this }, order() { return this },
    range: async (start: number, end: number) => ({ data: (tables[name] ?? []).slice(start, end + 1), error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  }) } as unknown as SupabaseClient<Database>
}
describe('RM08 retained obligations in accounting report', () => {
  it('retained uncredited award accrues expense and liability in original period', async () => {
    const report = await buildModeloAAccountingReport(client({ prize_reviews: [review] }))
    expect(report.rows[0]).toMatchObject({ period: '2026-08', prizeCreditsCents: 0, prizeAccruedCents: 1000000, closingWalletLiabilityCents: 1000000 })
    expect(report.snapshot.prizeSubledgerLiabilityCents).toBe(1000000)
    expect(report.snapshot.uncreditedPrizeLiabilityCents).toBe(1000000)
  })
  it('later release affects availability but does not re-accrue expense or double liability', async () => {
    const tx = { id: 'credit', user_id: 'u', type: 'prize_credit', reference_type: 'tournament', reference_id: 't', amount_cents: 1000000, balance_after_cents: 1000000, created_at: '2026-09-01T16:00:00Z', metadata: {} }
    const report = await buildModeloAAccountingReport(client({ prize_reviews: [{ ...review, status: 'approved' }], wallet_transactions: [tx] }))
    const august = report.rows.find(r => r.period === '2026-08')!
    const september = report.rows.find(r => r.period === '2026-09')!
    expect(august.prizeAccruedCents).toBe(1000000); expect(august.closingWalletLiabilityCents).toBe(1000000)
    expect(september.prizeCreditsCents).toBe(1000000); expect(september.prizeAccruedCents).toBe(0)
    expect(september.closingWalletLiabilityCents).toBe(1000000); expect(report.snapshot.prizeSubledgerLiabilityCents).toBe(1000000)
    expect(report.snapshot.uncreditedPrizeLiabilityCents).toBe(0)
    const [headers, ...rows] = accountingReportToCsv(report).split('\n').map(line => line.split(','))
    const i = headers.indexOf('premios_devengados_clp')
    expect(rows[0][i]).toBe('0'); expect(rows[1][i]).toBe('10000')
  })
  it('historical credited award stays in original expense period when reviews are backfilled', async () => {
    const tx = { id: 'credit', user_id: 'u', type: 'prize_credit', reference_type: 'tournament', reference_id: 't', amount_cents: 1000000, balance_after_cents: 1000000, created_at: review.created_at, metadata: {} }
    const report = await buildModeloAAccountingReport(client({ prize_reviews: [review], wallet_transactions: [tx] }))
    expect(report.rows[0].prizeAccruedCents).toBe(1000000); expect(report.rows[0].prizeCreditsCents).toBe(1000000)
    expect(report.snapshot.prizeSubledgerLiabilityCents).toBe(1000000)
  })
  it.each(['claimed', 'approved', 'transferring', 'reconciling'])('counts %s as outstanding reservation, never a paid bank transfer', async status => {
    const report = await buildModeloAAccountingReport(client({ withdrawal_requests: [{ id: 'w', user_id: 'u', amount_cents: 500000, status, created_at: review.created_at, reviewed_at: review.created_at }] }))
    expect(report.snapshot.pendingWithdrawalsCount).toBe(1); expect(report.snapshot.pendingWithdrawalsCents).toBe(500000)
    expect(report.rows[0].withdrawalPaidCents).toBe(0)
  })
})
