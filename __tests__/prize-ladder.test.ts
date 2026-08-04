import { describe, it, expect } from 'vitest'
import {
  buildPrizeLadder,
  selectPrizeTier,
  DEFAULT_PRIZE_FUND_BPS,
  type PrizeTier,
} from '@/lib/tournament/finance'

// Escalera de premios: bolsa garantizada que sube por tramos con la convocatoria,
// manteniendo el retorno al jugador en banda sana en vez de colapsar al llenarse.

describe('buildPrizeLadder', () => {
  it('genera los tramos por múltiplos del mínimo (Estándar $3.000, min 6, max 30)', () => {
    const ladder = buildPrizeLadder({ entryFeeCents: 300000, minPlayers: 6, maxPlayers: 30 })
    expect(ladder.map((t) => t.thresholdPlayers)).toEqual([6, 15, 30])

    // Tramo base = 65% de 6 × $3.000, distribuido 70/20/10.
    expect(ladder[0]!.fundCents).toBe(1170000)
    expect(ladder[0]!.prize1Cents).toBe(819000) // 70%
    expect(ladder[0]!.prize2Cents).toBe(234000) // 20%
    expect(ladder[0]!.prize3Cents).toBe(117000) // 10%

    // Tramo a 15 jugadores = 65% × 3000 × 15 = $29.250.
    expect(ladder[1]!.fundCents).toBe(2925000)
  })

  it('el split siempre suma el fondo del tramo (sin drift de redondeo)', () => {
    const ladder = buildPrizeLadder({ entryFeeCents: 150000, minPlayers: 6, maxPlayers: 30 })
    for (const t of ladder) {
      expect(t.prize1Cents + t.prize2Cents + t.prize3Cents).toBe(t.fundCents)
    }
  })

  it('cada tramo es solvente: fondo ≤ entry × su umbral', () => {
    const entry = 500000
    const ladder = buildPrizeLadder({ entryFeeCents: entry, minPlayers: 4, maxPlayers: 20 })
    for (const t of ladder) {
      expect(t.fundCents).toBeLessThanOrEqual(entry * t.thresholdPlayers)
    }
  })

  it('publica la capacidad máxima como tramo final', () => {
    const ladder = buildPrizeLadder({ entryFeeCents: 100000, minPlayers: 8, maxPlayers: 16 })
    expect(ladder.map((t) => t.thresholdPlayers)).toEqual([8, 16])
  })

  it('usa el prizeFundBps por defecto (65%)', () => {
    const [base] = buildPrizeLadder({ entryFeeCents: 100000, minPlayers: 10, maxPlayers: 10 })
    expect(base!.fundCents).toBe(Math.round((100000 * 10 * DEFAULT_PRIZE_FUND_BPS) / 10000))
  })

  it('rechaza entradas inválidas', () => {
    expect(() => buildPrizeLadder({ entryFeeCents: -1, minPlayers: 6 })).toThrow()
    expect(() => buildPrizeLadder({ entryFeeCents: 300000, minPlayers: 0 })).toThrow()
  })

  it('rechaza un tramo base que excede los topes del piloto', () => {
    expect(() =>
      buildPrizeLadder({ entryFeeCents: 1_000_000, minPlayers: 20, maxPlayers: 20 })
    ).toThrow('topes de premios')
  })
})

describe('selectPrizeTier', () => {
  const ladder: PrizeTier[] = buildPrizeLadder({ entryFeeCents: 300000, minPlayers: 6, maxPlayers: 30 })
  // umbrales permitidos por los topes piloto: [6, 15, 30]

  it('elige el mayor tramo cuyo umbral no supera los inscritos', () => {
    expect(selectPrizeTier(ladder, 6).thresholdPlayers).toBe(6)
    expect(selectPrizeTier(ladder, 14).thresholdPlayers).toBe(6)
    expect(selectPrizeTier(ladder, 15).thresholdPlayers).toBe(15)
    expect(selectPrizeTier(ladder, 29).thresholdPlayers).toBe(15)
    expect(selectPrizeTier(ladder, 30).thresholdPlayers).toBe(30)
    expect(selectPrizeTier(ladder, 200).thresholdPlayers).toBe(30)
  })

  it('cae al tramo base si los inscritos son menos que el umbral base', () => {
    expect(selectPrizeTier(ladder, 3).thresholdPlayers).toBe(6)
  })

  it('lanza si la escalera está vacía', () => {
    expect(() => selectPrizeTier([], 10)).toThrow()
  })
})
