import { describe, it, expect } from 'vitest'
import {
  reviewWinnerStats,
  computeIntervalStats,
  WINNER_REVIEW_THRESHOLDS,
} from '@/lib/anticheat/winner-review'

describe('reviewWinnerStats', () => {
  it('sin señales para un ganador humano típico', () => {
    const flags = reviewWinnerStats({
      moveCount: 400,
      finalScore: 16000, // 40 pts/mov — experto normal
      durationMs: 400 * 900,
      minIntervalMs: 350,
      avgIntervalMs: 900,
    })
    expect(flags).toEqual([])
  })

  it('alerta por pts/movimiento sobrehumano (zona gris bajo el umbral de ban)', () => {
    const flags = reviewWinnerStats({
      moveCount: 100,
      finalScore: 30000, // 300 pts/mov — bajo el ban (350) pero imposible sostenido
      durationMs: 100 * 800,
      minIntervalMs: 500,
      avgIntervalMs: 800,
    })
    expect(flags.map((f) => f.code)).toContain('high_pts_per_move')
  })

  it('alerta por ritmo promedio de bot con juego largo', () => {
    const flags = reviewWinnerStats({
      moveCount: 200,
      finalScore: 8000,
      durationMs: 200 * 300,
      minIntervalMs: 250,
      avgIntervalMs: 300,
    })
    expect(flags.map((f) => f.code)).toContain('fast_pace')
  })

  it('no marca fast_pace en partidas cortas (varianza alta)', () => {
    const flags = reviewWinnerStats({
      moveCount: 10,
      finalScore: 500,
      durationMs: 3000,
      minIntervalMs: 250,
      avgIntervalMs: 300,
    })
    expect(flags.map((f) => f.code)).not.toContain('fast_pace')
  })

  it('alerta por ráfaga puntual y por puntaje grande', () => {
    const flags = reviewWinnerStats({
      moveCount: 900,
      finalScore: WINNER_REVIEW_THRESHOLDS.bigScore,
      durationMs: 900 * 700,
      minIntervalMs: 90,
      avgIntervalMs: 700,
    })
    const codes = flags.map((f) => f.code)
    expect(codes).toContain('burst_present')
    expect(codes).toContain('big_score')
  })
})

describe('computeIntervalStats', () => {
  it('calcula duración, mínimo y promedio', () => {
    const t0 = 1_000_000
    const stats = computeIntervalStats([t0, t0 + 500, t0 + 1500, t0 + 1800])
    expect(stats.durationMs).toBe(1800)
    expect(stats.minIntervalMs).toBe(300)
    expect(stats.avgIntervalMs).toBe(600)
  })

  it('retorna nulls con menos de 2 movimientos', () => {
    expect(computeIntervalStats([123])).toEqual({
      durationMs: null,
      minIntervalMs: null,
      avgIntervalMs: null,
    })
  })
})
