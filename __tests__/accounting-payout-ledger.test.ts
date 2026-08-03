import { describe, expect, it } from 'vitest'
import {
  accountingReportToCsv,
  createEmptyAccountingPeriod,
  type AccountingReport,
} from '@/lib/accounting/model-a-report'

describe('accounting payout ledger columns', () => {
  it('separa premio devengado, pago autorizado y transferencia pagada', () => {
    const row = createEmptyAccountingPeriod('2026-08')
    row.prizeCreditsCents = 90_000_00
    row.withdrawalApprovedCents = 40_000_00
    row.withdrawalPaidCents = 35_000_00

    const csv = accountingReportToCsv({ rows: [row] } as AccountingReport)
    const [headerLine, valueLine] = csv.split('\n')
    const headers = headerLine.split(',')
    const values = valueLine.split(',')

    expect(values[headers.indexOf('premios_acreditados_clp')]).toBe('90000')
    expect(values[headers.indexOf('retiros_aprobados_clp')]).toBe('40000')
    expect(values[headers.indexOf('retiros_pagados_clp')]).toBe('35000')
    expect(values[headers.indexOf('premios_devengados_clp')]).toBe('90000')
  })
})
