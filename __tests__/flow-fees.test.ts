import { describe, it, expect } from 'vitest'
import {
  computeDepositBreakdown,
  USER_FEE_MIN_CENTS,
  USER_FEE_RATE,
} from '@/lib/flow/fees'

describe('computeDepositBreakdown', () => {
  it('aplica una tasa que cubre Flow más IVA en el rango medio', () => {
    // $50.000 CLP -> fee bruto ~3,95% para cubrir Flow 3,19% + IVA del servicio.
    const b = computeDepositBreakdown(5_000_000)
    expect(b.netCents).toBe(5_000_000)
    expect(b.userFeeCents).toBeGreaterThanOrEqual(197_000)
    expect(b.chargedCents).toBe(b.netCents + b.userFeeCents)
  })

  it('aplica fee mínimo en montos chicos', () => {
    const b = computeDepositBreakdown(100_000)
    expect(b.userFeeCents).toBeGreaterThanOrEqual(USER_FEE_MIN_CENTS)
  })

  it('no aplica tope de fee que haga perder dinero en montos grandes', () => {
    const b = computeDepositBreakdown(50_000_000)
    expect(b.userFeeCents).toBeGreaterThan(1_970_000)
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

  it('USER_FEE_RATE queda alrededor de 3,95%', () => {
    expect(USER_FEE_RATE).toBeGreaterThan(0.039)
    expect(USER_FEE_RATE).toBeLessThan(0.04)
  })
})
