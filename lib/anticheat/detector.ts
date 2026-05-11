import { createAdminClient } from '@/lib/supabase/server'
import { getAnticheatConfig } from '@/lib/env'

// Umbrales de deteccion (overrideables via env, ver getAnticheatConfig).
//
// MIN_HUMAN_MOVE_MS: reaccion humana minima realista.
//   El record mundial de reaccion humana es ~100ms. 80ms como limite
//   inferior absoluto — ningun humano puede percibir y ejecutar antes.
//
// BOT_BURST_THRESHOLD: movimientos ultra-rapidos consecutivos para ban.
//   Un solo movimiento rapido puede ser glitch de red. Cinco consecutivos
//   = patron de bot.
//
// MAX_AVG_PTS_PER_MOVE: umbral de score promedio por movimiento imposible.
//   Analisis empirico del juego 2048:
//   - Novato: ~10-20 pts/mov promedio
//   - Experto llegando a 2048: ~40 pts/mov (~20.000 pts en 500 movs)
//   - Excepcional llegando a 4096: ~100 pts/mov (~100.000 pts en 1000 movs)
//   - Imposible sostener >350 pts/mov en 20+ movs (requiere mergear tiles
//     de 512+ continuamente desde el inicio).
//
// MIN_MOVES_FOR_SCORE_CHECK: ventana de calentamiento donde la varianza
//   por movimientos afortunados es alta y no chequeamos score promedio.

export interface AnticheatResult {
  suspicious: boolean
  reason?: 'bot_timing' | 'fast_move' | 'impossible_score'
  autoBanned?: boolean
}

/**
 * Analiza un movimiento recien procesado en busca de comportamiento de bot.
 * Llamar DESPUES de persistir el movimiento en game_moves y ANTES de
 * responder al cliente. Si autoBanned=true, la route debe rechazar el
 * movimiento actual con 403 (no solo bloquear los siguientes).
 *
 * Antes era fire-and-forget; en serverless ese patron pierde bans cuando
 * la lambda se apaga antes de resolver la promise.
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
          .order('move_number', { ascending: false })
          .limit(cfg.botBurstThreshold + 1)

        if (recentMoves && recentMoves.length >= cfg.botBurstThreshold) {
          let allFast = true
          for (let i = 0; i < recentMoves.length - 1; i++) {
            const interval =
              Date.parse(recentMoves[i]!.server_timestamp) -
              Date.parse(recentMoves[i + 1]!.server_timestamp)
            // Un intervalo no positivo o >= minHumanMoveMs rompe el burst.
            if (interval >= cfg.minHumanMoveMs || interval <= 0) {
              allFast = false
              break
            }
          }

          if (allFast) {
            await applyAutoBan(
              userId,
              `Bot detectado: ${cfg.botBurstThreshold} movimientos consecutivos < ${cfg.minHumanMoveMs}ms (ultimo intervalo: ${elapsed}ms)`
            )
            return { suspicious: true, reason: 'bot_timing', autoBanned: true }
          }
        }

        // Un solo movimiento ultra-rapido: sospechoso pero no ban inmediato.
        return { suspicious: true, reason: 'fast_move' }
      }

      // Timestamp de cliente manipulado: senal de fraude aunque no se use
      // para calcular jugadas.
      if (clientElapsed <= 0 && moveCount > 2) {
        await applyAutoBan(userId, `Timestamp de cliente manipulado: elapsed=${clientElapsed}ms en movimiento ${moveNumber}`)
        return { suspicious: true, reason: 'bot_timing', autoBanned: true }
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
 * Aplica ban automático: marca perfil como baneado e invalida partidas activas.
 */
async function applyAutoBan(userId: string, reason: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('profiles')
    .update({ is_banned: true })
    .eq('id', userId)

  await supabase
    .from('games')
    .update({ status: 'invalid', end_reason: 'invalid', ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')

  console.warn(`[anticheat] Auto-ban: usuario=${userId} razón="${reason}"`)
}
