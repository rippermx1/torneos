// Revisión post-torneo de GANADORES (los que reciben premio). No bloquea el
// pago: produce señales para que el operador revise la partida en el admin
// antes de aprobar el cobro del premio. Complementa al detector en vivo
// (detector.ts), que banea los casos flagrantes; esto atrapa la zona gris:
// bots "a velocidad humana" con consistencia imposible.

export interface WinnerGameStats {
  moveCount: number
  finalScore: number
  /** Duración de la partida (primer→último movimiento) en ms, si se conoce. */
  durationMs: number | null
  /** Intervalo mínimo entre movimientos (ms). */
  minIntervalMs: number | null
  /** Intervalo promedio entre movimientos (ms). */
  avgIntervalMs: number | null
}

export interface WinnerFlag {
  code: 'high_pts_per_move' | 'fast_pace' | 'burst_present' | 'big_score'
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
} {
  if (serverTimestampsMs.length < 2) {
    return { durationMs: null, minIntervalMs: null, avgIntervalMs: null }
  }
  let min = Number.POSITIVE_INFINITY
  for (let i = 1; i < serverTimestampsMs.length; i++) {
    const interval = serverTimestampsMs[i]! - serverTimestampsMs[i - 1]!
    if (interval > 0 && interval < min) min = interval
  }
  const durationMs = serverTimestampsMs[serverTimestampsMs.length - 1]! - serverTimestampsMs[0]!
  return {
    durationMs,
    minIntervalMs: Number.isFinite(min) ? min : null,
    avgIntervalMs: durationMs / (serverTimestampsMs.length - 1),
  }
}
