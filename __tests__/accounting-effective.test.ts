import { describe, expect, it } from 'vitest'
import { calculateEffectivePeriodTax } from '@/lib/accounting/model-a-report'
import { calculateIvaIncludedBreakdown, pesosToCents } from '@/lib/tournament/finance'

// Contabilidad efectiva de la plataforma:
// IVA débito = 19/119 × (cobros por inscripción − premios pagados − reembolsos).
// No depende del split contable 70/30. Estos tests fijan el criterio y
// documentan por qué deja de existir la ambigüedad anterior.
describe('contabilidad efectiva (IVA sobre margen real)', () => {
  it('IVA se reconoce sobre cobros − premios, no sobre el split 70/30', () => {
    // Estándar lleno a objetivo: 30 inscritos × $3.000, premio fijo $12.600.
    const tax = calculateEffectivePeriodTax({
      entriesCollectedCents: pesosToCents(90000),
      prizesPaidCents: pesosToCents(12600),
      refundsCents: 0,
    })

    expect(tax.taxableMarginCents).toBe(pesosToCents(77400))
    // Invariante: margen = neto + IVA (sin drift de redondeo).
    expect(tax.netResultCents + tax.ivaDebitCents).toBe(tax.taxableMarginCents)
    expect(tax.ivaDebitCents).toBe(
      calculateIvaIncludedBreakdown(pesosToCents(77400)).ivaCents
    )
  })

  it('con premios fijos, el margen efectivo supera al fee nominal 30% al llenarse', () => {
    // El "fee 30%" del split asumiría 30% de $90.000 = $27.000. Pero los premios
    // son fijos al mínimo, así que el margen real es mucho mayor: la reserva de
    // premios de los jugadores sobre el mínimo nunca se paga.
    const tax = calculateEffectivePeriodTax({
      entriesCollectedCents: pesosToCents(90000),
      prizesPaidCents: pesosToCents(12600),
      refundsCents: 0,
    })
    const nominalSplitFee = pesosToCents(27000) // 30% × 90.000

    expect(tax.taxableMarginCents).toBeGreaterThan(nominalSplitFee)
  })

  it('los reembolsos por cancelación revierten el cobro (margen 0)', () => {
    const tax = calculateEffectivePeriodTax({
      entriesCollectedCents: pesosToCents(18000),
      prizesPaidCents: 0,
      refundsCents: pesosToCents(18000),
    })

    expect(tax.taxableMarginCents).toBe(0)
    expect(tax.ivaDebitCents).toBe(0)
    expect(tax.netResultCents).toBe(0)
  })

  it('margen negativo en borde de mes produce IVA remanente (negativo)', () => {
    // Premios pagados de un torneo cuya inscripción se cobró el mes anterior.
    const tax = calculateEffectivePeriodTax({
      entriesCollectedCents: 0,
      prizesPaidCents: pesosToCents(5000),
      refundsCents: 0,
    })

    expect(tax.taxableMarginCents).toBe(pesosToCents(-5000))
    expect(tax.ivaDebitCents).toBeLessThan(0)
    expect(tax.netResultCents + tax.ivaDebitCents).toBe(tax.taxableMarginCents)
  })

  it('sin actividad, todo es cero', () => {
    const tax = calculateEffectivePeriodTax({
      entriesCollectedCents: 0,
      prizesPaidCents: 0,
      refundsCents: 0,
    })

    expect(tax).toEqual({ taxableMarginCents: 0, ivaDebitCents: 0, netResultCents: 0 })
  })
})
