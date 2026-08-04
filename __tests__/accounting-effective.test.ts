import { describe, expect, it } from 'vitest'
import { calculateCanonicalPeriodAccounting } from '@/lib/accounting/model-a-report'
import { calculateIvaIncludedBreakdown, pesosToCents } from '@/lib/tournament/finance'

describe('contabilidad canónica de inscripciones', () => {
  it('extrae el IVA desde el precio final completo de $1.000', () => {
    const result = calculateCanonicalPeriodAccounting({
      grossSalesCents: pesosToCents(1000),
      creditNoteGrossCents: 0,
      economicRefundGrossCents: 0,
      prizesAccruedCents: 0,
      flowFeeNetCents: 0,
      refundFeeNetCents: 0,
    })

    expect(result.netSalesCents).toBe(84034)
    expect(result.ivaDebitCents).toBe(15966)
    expect(result.netSalesCents + result.ivaDebitCents).toBe(pesosToCents(1000))
  })

  it('el premio reduce el resultado, pero nunca el IVA de la venta', () => {
    const result = calculateCanonicalPeriodAccounting({
      grossSalesCents: pesosToCents(1000),
      creditNoteGrossCents: 0,
      economicRefundGrossCents: 0,
      prizesAccruedCents: pesosToCents(650),
      flowFeeNetCents: pesosToCents(31.9),
      refundFeeNetCents: 0,
    })

    expect(result.ivaDebitCents).toBe(15966)
    expect(result.accruedContributionCents).toBe(15844)
  })

  it('una devolución económica sin nota de crédito aún no rebaja el débito F29', () => {
    const result = calculateCanonicalPeriodAccounting({
      grossSalesCents: pesosToCents(1000),
      creditNoteGrossCents: 0,
      economicRefundGrossCents: pesosToCents(1000),
      prizesAccruedCents: 0,
      flowFeeNetCents: 0,
      refundFeeNetCents: 0,
    })

    expect(result.netSalesAfterRefundsCents).toBe(0)
    expect(result.netIvaDebitCents).toBe(15966)
  })

  it('la nota de crédito completa revierte base neta e IVA de la venta', () => {
    const result = calculateCanonicalPeriodAccounting({
      grossSalesCents: pesosToCents(1000),
      creditNoteGrossCents: pesosToCents(1000),
      economicRefundGrossCents: pesosToCents(1000),
      prizesAccruedCents: 0,
      flowFeeNetCents: 0,
      refundFeeNetCents: 0,
    })
    const sale = calculateIvaIncludedBreakdown(pesosToCents(1000))

    expect(result.creditNoteIvaCents).toBe(sale.ivaCents)
    expect(result.netIvaDebitCents).toBe(0)
    expect(result.netSalesAfterRefundsCents).toBe(0)
  })

  it('la comisión Flow estimada reduce gestión, no el IVA débito del F29', () => {
    const withoutFee = calculateCanonicalPeriodAccounting({
      grossSalesCents: pesosToCents(1000),
      creditNoteGrossCents: 0,
      economicRefundGrossCents: 0,
      prizesAccruedCents: 0,
      flowFeeNetCents: 0,
      refundFeeNetCents: 0,
    })
    const withFee = calculateCanonicalPeriodAccounting({
      grossSalesCents: pesosToCents(1000),
      creditNoteGrossCents: 0,
      economicRefundGrossCents: 0,
      prizesAccruedCents: 0,
      flowFeeNetCents: pesosToCents(31.9),
      refundFeeNetCents: 0,
    })

    expect(withFee.netIvaDebitCents).toBe(withoutFee.netIvaDebitCents)
    expect(withFee.accruedContributionCents).toBe(
      withoutFee.accruedContributionCents - pesosToCents(31.9)
    )
  })
})
