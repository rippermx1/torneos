import { describe, expect, it } from 'vitest'
import {
  buildFixedPrize,
  FIXED_PRIZE_BUDGET_BPS,
  maxPlayersForMinimum,
  pesosToCents,
} from '@/lib/tournament/finance'

describe('fixed prize policy', () => {
  it('publica una sola promesa fija equivalente al 55% del bruto mínimo', () => {
    const prize = buildFixedPrize({
      entryFeeCents: pesosToCents(5000),
      minPlayers: 12,
      maxPlayers: 15,
    })

    expect(FIXED_PRIZE_BUDGET_BPS).toBe(5500)
    expect(prize.fundCents).toBe(pesosToCents(33000))
    expect(prize.prize1Cents).toBe(pesosToCents(24750))
    expect(prize.prize2Cents).toBe(pesosToCents(8250))
    expect(prize.prize3Cents).toBe(0)
  })

  it('el premio no recibe el número final de inscritos como entrada', () => {
    const atPublication = buildFixedPrize({
      entryFeeCents: pesosToCents(5000),
      minPlayers: 12,
      maxPlayers: 15,
    })

    expect(atPublication.fundCents).toBe(pesosToCents(33000))
  })

  it('mantiene el tercer premio en cero aunque el fondo tenga remanente por redondeo', () => {
    const prize = buildFixedPrize({
      entryFeeCents: 200001,
      minPlayers: 3,
      maxPlayers: 3,
    })

    expect(prize.prize3Cents).toBe(0)
    expect(prize.prize1Cents + prize.prize2Cents).toBe(prize.fundCents)
  })

  it('limita la capacidad a 1,25 veces el mínimo', () => {
    expect(maxPlayersForMinimum(8)).toBe(10)
    expect(() => buildFixedPrize({
      entryFeeCents: pesosToCents(2000),
      minPlayers: 8,
      maxPlayers: 11,
    })).toThrow('1,25')
  })

  it('rechaza tickets bajo $2.000 y premios sobre el presupuesto', () => {
    expect(() => buildFixedPrize({
      entryFeeCents: pesosToCents(1999),
      minPlayers: 8,
      maxPlayers: 10,
    })).toThrow('$2.000')

    expect(() => buildFixedPrize({
      entryFeeCents: pesosToCents(2000),
      minPlayers: 8,
      maxPlayers: 10,
      prizeBudgetBps: 6000,
    })).toThrow('presupuesto')

    expect(() => buildFixedPrize({
      entryFeeCents: pesosToCents(2000),
      minPlayers: 8,
      maxPlayers: 10,
      prize1Bps: -1,
      prize2Bps: 10001,
    })).toThrow('entre 0% y 100%')
  })

  it('respeta los topes monetarios del piloto', () => {
    expect(() => buildFixedPrize({
      entryFeeCents: pesosToCents(10000),
      minPlayers: 20,
      maxPlayers: 20,
    })).toThrow('topes monetarios')
  })
})
