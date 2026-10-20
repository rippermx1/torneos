import { createAdminClient } from '@/lib/supabase/server'
import { getAnticheatConfig } from '@/lib/env'
import { setAccountSanction } from '@/lib/anticheat/integrity'

// Configurable timing/score heuristics, not proof of human play or identity.
// Server receipt times can include transport bursts; paced automation can pass.

export interface AnticheatResult {
  suspicious: boolean
  reason?: 'bot_timing' | 'fast_move' | 'client_clock' | 'impossible_score'
  autoBanned?: boolean
}

/**
 * Analyze a persisted move. The route schedules this with after(); already
 * accepted or concurrent moves may precede the sanction. autoBanned confirms
 * atomic account/game/audit persistence. Requests committed before the sanction
 * can precede it; commits after it are rejected by the database account gate.
 */
export async function analyzeMove(params: {
  gameId: string
  userId: string
  moveNumber: number
  clientTimestamp: number
  serverTimestamp?: string | null
  moveCount: number
  currentScore: number
}): Promise<AnticheatResult> {
  const { gameId, userId, moveNumber, clientTimestamp, serverTimestamp, moveCount, currentScore } = params
  const supabase = createAdminClient()
  const cfg = getAnticheatConfig()

  // 1. Timing: movimientos imposiblemente rapidos.
  // Solo aplica desde el segundo movimiento (necesitamos el anterior para comparar).
  if (moveCount > 1) {
    const { data: prevMove } = await supabase
      .from('game_moves')
      .select('client_timestamp, server_timestamp')
      .eq('game_id', gameId)
      .eq('move_number', moveNumber - 1)
      .single()

    if (prevMove && serverTimestamp) {
      const elapsed = Date.parse(serverTimestamp) - Date.parse(prevMove.server_timestamp)
      const clientElapsed = clientTimestamp - prevMove.client_timestamp

      // Timing primario usa server_timestamp, no datos controlados por el cliente.
      if (elapsed > 0 && elapsed < cfg.minHumanMoveMs) {
        // Verificar burst consecutivo en los ultimos N+1 movimientos.
        const { data: recentMoves } = await supabase
          .from('game_moves')
          .select('server_timestamp')
          .eq('game_id', gameId)
          .lte('move_number', moveNumber)
          .order('move_number', { ascending: false })
          .limit(cfg.botBurstThreshold + 1)

        if (recentMoves && recentMoves.length === cfg.botBurstThreshold + 1) {
          let allFast = true
          for (let i = 0; i < recentMoves.length - 1; i++) {
            const interval =
              Date.parse(recentMoves[i]!.server_timestamp) -
              Date.parse(recentMoves[i + 1]!.server_timestamp)
            // Un intervalo no positivo o >= minHumanMoveMs rompe el burst.
            if (!Number.isFinite(interval) || interval >= cfg.minHumanMoveMs || interval <= 0) {
              allFast = false
              break
            }
          }

          if (allFast) {
            await applyAutoBan(
              userId,
              `Ráfaga: ${cfg.botBurstThreshold} intervalos consecutivos < ${cfg.minHumanMoveMs}ms (último: ${elapsed}ms)`
            )
            return { suspicious: true, reason: 'bot_timing', autoBanned: true }
          }
        }

        // Un solo movimiento ultra-rapido: sospechoso pero no ban inmediato.
        return { suspicious: true, reason: 'fast_move' }
      }

      // Reloads, device clock adjustments and forged values can all cause this.
      // A client-controlled timestamp alone cannot justify an account sanction.
      if (clientElapsed <= 0 && moveCount > 2) {
        return { suspicious: true, reason: 'client_clock' }
      }
    }
  }

  // 2. Score promedio imposible. Solo evaluar pasada la ventana de calentamiento
  // donde la varianza es alta (rachas iniciales afortunadas).
  if (moveCount >= cfg.minMovesForScoreCheck) {
    const avgScorePerMove = currentScore / moveCount
    if (avgScorePerMove > cfg.maxAvgPtsPerMove) {
      await applyAutoBan(
        userId,
        `Score imposible: promedio ${avgScorePerMove.toFixed(0)} pts/movimiento ` +
        `(${currentScore} pts en ${moveCount} movs, umbral: ${cfg.maxAvgPtsPerMove} pts/mov)`
      )
      return { suspicious: true, reason: 'impossible_score', autoBanned: true }
    }
  }

  return { suspicious: false }
}

/**
 * Apply the existing burst/score policy atomically, including unsettled results.
 */
async function applyAutoBan(userId: string, reason: string): Promise<void> {
  const supabase = createAdminClient()

  await setAccountSanction(supabase, { userId, banned: true, reason })

  console.warn(`[anticheat] Auto-ban: usuario=${userId} razón="${reason}"`)
}
