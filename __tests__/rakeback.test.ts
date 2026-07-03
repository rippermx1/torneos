import { describe, it, expect } from 'vitest'
import { computeRakebackCents, rakebackExpiryIso, DEFAULT_RAKEBACK_BPS } from '@/lib/wallet/rakeback'

describe('computeRakebackCents', () => {
  it('devuelve el 7% de la inscripción por defecto', () => {
    expect(computeRakebackCents(100000)).toBe(7000) // $1.000 -> $70
    expect(computeRakebackCents(300000)).toBe(21000) // $3.000 -> $210
  })

  it('respeta un bps personalizado y redondea', () => {
    expect(computeRakebackCents(150000, 700)).toBe(10500)
    expect(computeRakebackCents(100001, 700)).toBe(7000) // round(7000.07)
  })

  it('no genera crédito para freerolls o montos no válidos', () => {
    expect(computeRakebackCents(0)).toBe(0)
    expect(computeRakebackCents(-100)).toBe(0)
    expect(computeRakebackCents(1.5)).toBe(0)
  })

  it('usa el bps por defecto documentado (7%)', () => {
    expect(DEFAULT_RAKEBACK_BPS).toBe(700)
  })
})

describe('rakebackExpiryIso', () => {
  it('vence 30 días después del otorgamiento', () => {
    const now = new Date('2026-07-02T00:00:00.000Z')
    expect(rakebackExpiryIso(now)).toBe('2026-08-01T00:00:00.000Z')
  })
})
