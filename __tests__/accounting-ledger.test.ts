import { describe, expect, it } from 'vitest'
import {
  calculateLedgerTotals,
  journalLinesToCsv,
  type JournalLine,
  type TrialBalanceRow,
} from '@/lib/accounting/ledger'

describe('libro contable', () => {
  it('separa totales confirmados y estimados usando el balance completo', () => {
    const rows = [
      { is_estimate: false, debit_cents: 100_000, credit_cents: 40_000 },
      { is_estimate: false, debit_cents: 0, credit_cents: 60_000 },
      { is_estimate: true, debit_cents: 3_190, credit_cents: 0 },
      { is_estimate: true, debit_cents: 0, credit_cents: 3_190 },
    ] as TrialBalanceRow[]

    expect(calculateLedgerTotals(rows)).toEqual({
      confirmedDebitsCents: 100_000,
      confirmedCreditsCents: 100_000,
      estimatedDebitsCents: 3_190,
      estimatedCreditsCents: 3_190,
    })
  })

  it('exporta montos CLP y escapa descripciones CSV', () => {
    const line = {
      occurred_at: '2026-08-04T12:00:00.000Z',
      period: '2026-08',
      journal_entry_id: 1,
      event_key: 'ticket_sale:test',
      event_type: 'ticket_sale',
      description: 'Venta, inscripción "piloto"',
      is_estimate: false,
      posting_id: 1,
      account_code: '110200',
      account_name: 'Flow por liquidar',
      debit_cents: 100_000,
      credit_cents: 0,
      tournament_id: null,
      user_id: null,
      source_table: 'flow_payment_attempts',
      source_id: null,
      created_at: '2026-08-04T12:00:00.000Z',
    } as JournalLine

    const csv = journalLinesToCsv([line])

    expect(csv).toContain('debe_clp,haber_clp')
    expect(csv).toContain('1000,0')
    expect(csv).toContain('"Venta, inscripción ""piloto"""')
  })
})
