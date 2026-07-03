import { describe, it, expect } from 'vitest'
import { computeRakebackCents, rakebackExpiryIso, computeExpiredCredit, DEFAULT_RAKEBACK_BPS } from '@/lib/wallet/rakeback'

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

describe('computeExpiredCredit (FIFO)', () => {
  const now = new Date('2026-08-15T00:00:00.000Z')

  it('expira un grant vencido no consumido', () => {
    const txs = [{ amountCents: 7000, createdAt: '2026-07-01T00:00:00Z', expiresAt: '2026-07-31T00:00:00Z' }]
    expect(computeExpiredCredit(txs, now)).toBe(7000)
  })

  it('no expira un grant aún vigente', () => {
    const txs = [{ amountCents: 7000, createdAt: '2026-08-10T00:00:00Z', expiresAt: '2026-09-09T00:00:00Z' }]
    expect(computeExpiredCredit(txs, now)).toBe(0)
  })

  it('un consumo elimina el grant más antiguo (FIFO), no queda por expirar', () => {
    const txs = [
      { amountCents: 7000, createdAt: '2026-07-01T00:00:00Z', expiresAt: '2026-07-31T00:00:00Z' }, // vencido
      { amountCents: 7000, createdAt: '2026-08-10T00:00:00Z', expiresAt: '2026-09-09T00:00:00Z' }, // vigente
      { amountCents: -7000, createdAt: '2026-08-11T00:00:00Z' }, // redime -> consume el más antiguo (vencido)
    ]
    expect(computeExpiredCredit(txs, now)).toBe(0)
  })

  it('es idempotente: una expiración previa ya consumió su grant', () => {
    const txs = [
      { amountCents: 7000, createdAt: '2026-07-01T00:00:00Z', expiresAt: '2026-07-31T00:00:00Z' },
      { amountCents: -7000, createdAt: '2026-08-01T00:00:00Z' }, // expiración previa registrada
    ]
    expect(computeExpiredCredit(txs, now)).toBe(0)
  })

  it('expira solo el remanente no consumido de un grant vencido', () => {
    const txs = [
      { amountCents: 7000, createdAt: '2026-07-01T00:00:00Z', expiresAt: '2026-07-31T00:00:00Z' },
      { amountCents: -3000, createdAt: '2026-07-10T00:00:00Z' }, // consumo parcial
    ]
    expect(computeExpiredCredit(txs, now)).toBe(4000)
  })
})
