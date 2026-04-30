import { describe, it, expect } from 'vitest'
import {
  computeDepositBreakdown,
  USER_FEE_MIN_CENTS,
  USER_FEE_MAX_CENTS,
  USER_FEE_RATE,
} from '@/lib/flow/fees'

describe('computeDepositBreakdown', () => {
  it('aplica la tasa USER_FEE_RATE en el rango medio', () => {
    // $50.000 CLP = 5_000_000 cents → 1.5% = 75.000 cents = $750
    const b = computeDepositBreakdown(5_000_000)
    expect(b.netCents).toBe(5_000_000)
    expect(b.userFeeCents).toBeGreaterThanOrEqual(75_000)
    expect(b.chargedCents).toBe(b.netCents + b.userFeeCents)
  })

  it('aplica fee mínimo en montos chicos', () => {
    // $1.000 CLP = 100.000 cents → 1.5% = 1.500 cents, pero MIN es 15.000
    const b = computeDepositBreakdown(100_000)
    expect(b.userFeeCents).toBeGreaterThanOrEqual(USER_FEE_MIN_CENTS)
  })

  it('aplica fee máximo en montos grandes', () => {
    // $500.000 CLP = 50.000.000 cents → 1.5% = 750.000 cents, pero MAX es 500.000
    const b = computeDepositBreakdown(50_000_000)
    // Tras redondeo a peso entero el fee puede subir un máximo de 99 cents
    expect(b.userFeeCents).toBeLessThanOrEqual(USER_FEE_MAX_CENTS + 99)
  })

  it('chargedCents siempre es múltiplo de 100 (peso entero)', () => {
    for (const net of [100_000, 250_000, 1_111_100, 9_999_900, 50_000_000]) {
      const b = computeDepositBreakdown(net)
      expect(b.chargedCents % 100).toBe(0)
    }
  })

  it('chargedPesos coincide con chargedCents/100', () => {
    const b = computeDepositBreakdown(1_500_000)
    expect(b.chargedPesos).toBe(b.chargedCents / 100)
  })

  it('netCents queda intacto y la diferencia se absorbe en userFee', () => {
    const b = computeDepositBreakdown(1_234_500)
    expect(b.netCents).toBe(1_234_500)
    expect(b.netCents + b.userFeeCents).toBe(b.chargedCents)
  })

  it('rechaza valores no enteros o no positivos', () => {
    expect(() => computeDepositBreakdown(0)).toThrow()
    expect(() => computeDepositBreakdown(-100)).toThrow()
    expect(() => computeDepositBreakdown(100.5)).toThrow()
  })

  it('USER_FEE_RATE es 1.5%', () => {
    expect(USER_FEE_RATE).toBe(0.015)
  })
})
