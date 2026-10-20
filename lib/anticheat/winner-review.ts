// Revisión post-torneo de GANADORES (los que reciben premio). No bloquea el
// pago: produce señales para que el operador revise la partida en el admin
// antes de aprobar el cobro del premio. Complementa al detector en vivo
// (detector.ts). Estas heurísticas no prueban juego humano: la automatización
// con pausas variables puede no producir ninguna señal. La cadencia regular
// requiere revisión humana; no prueba automatización ni aplica un ban.

export interface WinnerGameStats {
  moveCount: number
  finalScore: number
  /** Duración de la partida (primer→último movimiento) en ms, si se conoce. */
  durationMs: number | null
  /** Intervalo mínimo entre movimientos (ms). */
  minIntervalMs: number | null
  /** Intervalo promedio entre movimientos (ms). */
  avgIntervalMs: number | null
  regularPace?: boolean
}

export interface WinnerFlag {
  code: 'high_pts_per_move' | 'fast_pace' | 'burst_present' | 'big_score' | 'regular_pace'
  detail: string
}

// Umbrales (mismos órdenes de magnitud que detector.ts, pero más estrictos
// porque aquí solo se ALERTA, no se banea):
// - detector banea a >350 pts/mov; aquí alertamos desde 210 (60%).
// - ritmo promedio <400ms/mov sostenido por 30+ movimientos es sobrehumano
//   para juego ÓPTIMO (jugadores rápidos existen, pero no ganando).
// - un intervalo mínimo <120ms indica al menos una ráfaga automatizada.
export const WINNER_REVIEW_THRESHOLDS = {
  alertPtsPerMove: 210,
  fastAvgIntervalMs: 400,
  fastPaceMinMoves: 30,
  burstIntervalMs: 120,
  bigScore: 50000,
} as const

export function reviewWinnerStats(stats: WinnerGameStats): WinnerFlag[] {
  const t = WINNER_REVIEW_THRESHOLDS
  const flags: WinnerFlag[] = []
  if (stats.regularPace) {
    flags.push({ code: 'regular_pace', detail: '30 intervalos de servidor entre 80 y 2000 ms con variación máxima de 10 ms; requiere revisión' })
  }

  if (stats.moveCount > 0) {
    const ptsPerMove = stats.finalScore / stats.moveCount
    if (ptsPerMove > t.alertPtsPerMove) {
      flags.push({
        code: 'high_pts_per_move',
        detail: `${ptsPerMove.toFixed(0)} pts/movimiento (alerta desde ${t.alertPtsPerMove})`,
      })
    }
  }

  if (
    stats.avgIntervalMs !== null &&
    stats.moveCount >= t.fastPaceMinMoves &&
    stats.avgIntervalMs < t.fastAvgIntervalMs
  ) {
    flags.push({
      code: 'fast_pace',
      detail: `ritmo promedio ${Math.round(stats.avgIntervalMs)} ms/mov en ${stats.moveCount} movimientos`,
    })
  }

  if (stats.minIntervalMs !== null && stats.minIntervalMs < t.burstIntervalMs) {
    flags.push({
      code: 'burst_present',
      detail: `intervalo mínimo ${Math.round(stats.minIntervalMs)} ms entre movimientos`,
    })
  }

  if (stats.finalScore >= t.bigScore) {
    flags.push({
      code: 'big_score',
      detail: `puntaje ${stats.finalScore.toLocaleString('es-CL')} (revisión informativa desde ${t.bigScore.toLocaleString('es-CL')})`,
    })
  }

  return flags
}

/** Estadísticas de intervalos a partir de timestamps ordenados de movimientos. */
export function computeIntervalStats(serverTimestampsMs: number[]): {
  durationMs: number | null
  minIntervalMs: number | null
  avgIntervalMs: number | null
  regularPace: boolean
} {
  if (serverTimestampsMs.length < 2) {
    return { durationMs: null, minIntervalMs: null, avgIntervalMs: null, regularPace: false }
  }
  let min = Number.POSITIVE_INFINITY
  const window: number[] = []
  let regularPace = false
  for (let i = 1; i < serverTimestampsMs.length; i++) {
    const interval = serverTimestampsMs[i]! - serverTimestampsMs[i - 1]!
    window.push(interval)
    if (window.length > 30) window.shift()
    if (window.length === 30 && window.every(ms => Number.isFinite(ms) && ms >= 80 && ms <= 2000)
      && Math.max(...window) - Math.min(...window) <= 10) regularPace = true
    if (interval > 0 && interval < min) min = interval
  }
  const durationMs = serverTimestampsMs[serverTimestampsMs.length - 1]! - serverTimestampsMs[0]!
  return {
    durationMs,
    minIntervalMs: Number.isFinite(min) ? min : null,
    avgIntervalMs: durationMs / (serverTimestampsMs.length - 1),
    regularPace,
  }
}
