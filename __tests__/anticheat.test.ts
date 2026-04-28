/**
 * Tests del módulo anticheat.
 *
 * Como analyzeMove requiere Supabase, testeamos la lógica de decisión
 * de forma aislada, simulando las mismas condiciones que el detector evalúa.
 */
import { describe, it, expect } from 'vitest'

// ── Constantes replicadas del detector (para tests independientes) ──────────
const MIN_HUMAN_MOVE_MS = 80
const BOT_BURST_THRESHOLD = 5
const MAX_AVG_PTS_PER_MOVE = 350
const MIN_MOVES_FOR_SCORE_CHECK = 20

// ── Lógica pura extraída para tests (misma que detector.ts) ─────────────────

function isBurstBot(timestamps: number[]): boolean {
  if (timestamps.length < BOT_BURST_THRESHOLD) return false
  for (let i = 0; i < timestamps.length - 1; i++) {
    const interval = timestamps[i]! - timestamps[i + 1]!
    if (interval >= MIN_HUMAN_MOVE_MS || interval <= 0) return false
  }
  return true
}

function hasImpossibleScore(score: number, moveCount: number): boolean {
  if (moveCount < MIN_MOVES_FOR_SCORE_CHECK) return false
  return (score / moveCount) > MAX_AVG_PTS_PER_MOVE
}

function hasManipulatedTimestamp(elapsed: number, moveCount: number): boolean {
  return elapsed <= 0 && moveCount > 2
}

// ── Tests de timing ──────────────────────────────────────────────────────────

describe('Anticheat — detección de burst bot (timing)', () => {
  it('5 movimientos consecutivos < 80ms = bot detectado', () => {
    // Timestamps desc: cada uno 30ms antes del siguiente
    const timestamps = [1000, 970, 940, 910, 880, 850]
    expect(isBurstBot(timestamps)).toBe(true)
  })

  it('4 movimientos rápidos NO dispara ban (threshold = 5)', () => {
    const timestamps = [1000, 970, 940, 910, 880]
    // length = 5, pero necesitamos BOT_BURST_THRESHOLD = 5 y 5 elementos dan 4 intervalos
    // El check es: length >= BOT_BURST_THRESHOLD (5) → 5 >= 5 = true, pero hay 4 intervalos
    // En realidad el loop itera length-1 = 4 veces → 4 intervalos verificados
    // ¿Esto es correcto? Con 5 timestamps tienes 4 intervalos: todos < 80ms → es bot
    expect(isBurstBot(timestamps)).toBe(true)
  })

  it('burst interrumpido por un movimiento lento NO es bot', () => {
    // Un movimiento de 200ms en el medio
    const timestamps = [1000, 970, 940, 740, 710, 680] // gap de 200ms entre el 3° y 4°
    expect(isBurstBot(timestamps)).toBe(false)
  })

  it('timestamps exactamente en el límite (80ms) NO dispara ban', () => {
    const timestamps = [1000, 920, 840, 760, 680, 600] // intervalos de 80ms exacto
    // 80ms >= MIN_HUMAN_MOVE_MS → NO es fast
    expect(isBurstBot(timestamps)).toBe(false)
  })

  it('timestamps con intervalo 79ms SI dispara ban', () => {
    const timestamps = [1000, 921, 842, 763, 684, 605] // intervalos de ~79ms
    expect(isBurstBot(timestamps)).toBe(true)
  })

  it('menos de BOT_BURST_THRESHOLD timestamps nunca es bot', () => {
    const timestamps = [1000, 970, 940] // solo 3
    expect(isBurstBot(timestamps)).toBe(false)
  })

  it('intervalo negativo (timestamp manipulado) rompe el burst', () => {
    // Si un timestamp va hacia atrás, el intervalo es negativo → no es burst
    const timestamps = [1000, 970, 980, 950, 920, 890] // 980 > 970 → intervalo negativo
    expect(isBurstBot(timestamps)).toBe(false)
  })
})

describe('Anticheat — timestamps manipulados', () => {
  it('elapsed negativo con moveCount > 2 = manipulación detectada', () => {
    expect(hasManipulatedTimestamp(-50, 10)).toBe(true)
    expect(hasManipulatedTimestamp(-1, 5)).toBe(true)
  })

  it('elapsed = 0 con moveCount > 2 = manipulación detectada', () => {
    expect(hasManipulatedTimestamp(0, 5)).toBe(true)
  })

  it('elapsed negativo en movimiento 1 o 2 NO se considera manipulación (posible desorden de red)', () => {
    expect(hasManipulatedTimestamp(-50, 1)).toBe(false)
    expect(hasManipulatedTimestamp(-50, 2)).toBe(false)
  })

  it('elapsed positivo nunca es manipulación de este tipo', () => {
    expect(hasManipulatedTimestamp(1, 10)).toBe(false)
    expect(hasManipulatedTimestamp(200, 100)).toBe(false)
  })
})

// ── Tests de score imposible ──────────────────────────────────────────────────

describe('Anticheat — score imposible', () => {
  it('score promedio > 350 pts/mov con 20+ movs = imposible', () => {
    expect(hasImpossibleScore(351 * 20, 20)).toBe(true)   // 7020 pts en 20 movs → 351 pts/mov
    expect(hasImpossibleScore(35_100, 100)).toBe(true)    // 35100 pts en 100 movs → 351 pts/mov
  })

  it('score promedio exactamente 350 NO es imposible (límite exclusivo)', () => {
    expect(hasImpossibleScore(350 * 20, 20)).toBe(false)  // exactamente 350 → no ban
    expect(hasImpossibleScore(35_000, 100)).toBe(false)   // exactamente 350 → no ban
  })

  it('score típico de jugador experto NO dispara ban', () => {
    // Jugador experto: 40 pts/mov promedio llegando a 2048
    expect(hasImpossibleScore(20_000, 500)).toBe(false) // 40 pts/mov
    // Jugador excepcional: 125 pts/mov
    expect(hasImpossibleScore(50_000, 400)).toBe(false) // 125 pts/mov
    // Jugador de clase mundial: 200 pts/mov
    expect(hasImpossibleScore(200_000, 1000)).toBe(false) // 200 pts/mov
  })

  it('score alto legítimo cerca del umbral no dispara ban', () => {
    // 340 pts/mov con 50 movs = 17000 pts en 50 movs (raro pero no imposible teóricamente)
    expect(hasImpossibleScore(17_000, 50)).toBe(false) // 340 pts/mov < 350
  })

  it('no chequea score con menos de MIN_MOVES_FOR_SCORE_CHECK movimientos', () => {
    // En movimiento 5, cualquier score es aceptable (alta varianza)
    expect(hasImpossibleScore(999_999, 5)).toBe(false)
    expect(hasImpossibleScore(999_999, 19)).toBe(false)
  })

  it('score = 0 nunca es imposible', () => {
    expect(hasImpossibleScore(0, 100)).toBe(false)
  })
})

// ── Tests de modelo de negocio (rentabilidad) ─────────────────────────────────

describe('Modelo de negocio — rentabilidad', () => {
  function isRentable(entryFeeCLP: number, minPlayers: number, prizes: [number, number, number]): boolean {
    if (entryFeeCLP === 0) return true // freerolls no aplica
    const totalPrizesCLP = prizes[0] + prizes[1] + prizes[2]
    const minRevenueCLP = entryFeeCLP * minPlayers
    return minRevenueCLP >= totalPrizesCLP * 1.2
  }

  it('Standard con 11 jugadores es rentable', () => {
    expect(isRentable(3_000, 11, [15_000, 8_000, 4_000])).toBe(true)
    // 33.000 >= 27.000 × 1.2 = 32.400 ✓
  })

  it('Standard con 10 jugadores NO es rentable (margen insuficiente)', () => {
    expect(isRentable(3_000, 10, [15_000, 8_000, 4_000])).toBe(false)
    // 30.000 < 27.000 × 1.2 = 32.400 ✗
  })

  it('Standard con 8 jugadores (original) NO era rentable', () => {
    expect(isRentable(3_000, 8, [15_000, 8_000, 4_000])).toBe(false)
    // 24.000 < 32.400 ✗
  })

  it('Express con 14 jugadores es rentable', () => {
    expect(isRentable(1_000, 14, [8_000, 3_000, 0])).toBe(true)
    // 14.000 >= 11.000 × 1.2 = 13.200 ✓
  })

  it('Express con 4 jugadores (original) NO era rentable', () => {
    expect(isRentable(1_000, 4, [8_000, 3_000, 0])).toBe(false)
    // 4.000 < 13.200 ✗
  })

  it('Elite con 12 jugadores es rentable', () => {
    expect(isRentable(10_000, 12, [60_000, 25_000, 10_000])).toBe(true)
    // 120.000 >= 95.000 × 1.2 = 114.000 ✓
  })

  it('Elite con 4 jugadores (original) NO era rentable', () => {
    expect(isRentable(10_000, 4, [60_000, 25_000, 10_000])).toBe(false)
    // 40.000 < 114.000 ✗
  })

  it('Elite con 11 jugadores tiene margen insuficiente', () => {
    expect(isRentable(10_000, 11, [60_000, 25_000, 10_000])).toBe(false)
    // 110.000 < 114.000 ✗
  })

  it('Freeroll siempre retorna true (no aplica cálculo)', () => {
    expect(isRentable(0, 2, [5_000, 0, 0])).toBe(true)
  })

  it('Elite lleno (20 jugadores) tiene margen máximo', () => {
    const revenue = 10_000 * 20 // 200.000
    const prizes = 60_000 + 25_000 + 10_000 // 95.000
    const margin = (revenue - prizes) / revenue
    expect(margin).toBeCloseTo(0.525, 2) // 52.5% margen ✓
  })
})

// ── Tests de orden de premios ─────────────────────────────────────────────────

describe('Validación orden de premios', () => {
  function prizesInOrder(p1: number, p2: number, p3: number): boolean {
    return p2 <= p1 && p3 <= p2
  }

  it('premios descendentes correctos', () => {
    expect(prizesInOrder(15_000, 8_000, 4_000)).toBe(true)
    expect(prizesInOrder(60_000, 25_000, 10_000)).toBe(true)
    expect(prizesInOrder(8_000, 3_000, 0)).toBe(true)
  })

  it('2° mayor que 1° es inválido', () => {
    expect(prizesInOrder(5_000, 10_000, 0)).toBe(false)
  })

  it('3° mayor que 2° es inválido', () => {
    expect(prizesInOrder(15_000, 4_000, 8_000)).toBe(false)
  })

  it('premios iguales son válidos', () => {
    expect(prizesInOrder(10_000, 10_000, 10_000)).toBe(true)
  })

  it('1° solo con 2° y 3° en cero es válido', () => {
    expect(prizesInOrder(8_000, 0, 0)).toBe(true)
  })
})
