import { createAdminClient } from '@/lib/supabase/server'

// ── Umbrales de detección ──────────────────────────────────────────────────
//
// MIN_HUMAN_MOVE_MS: reacción humana mínima realista.
//   El récord mundial de reacción humana es ~100ms. Establecemos 80ms como
//   límite inferior absoluto — ningún humano puede percibir y ejecutar antes.
const MIN_HUMAN_MOVE_MS = 80

// BOT_BURST_THRESHOLD: movimientos ultra-rápidos consecutivos para disparar ban.
//   Un solo movimiento rápido puede ser glitch de red. Cinco consecutivos = patrón de bot.
const BOT_BURST_THRESHOLD = 5

// MAX_AVG_PTS_PER_MOVE: umbral de score promedio por movimiento imposible para humanos.
//   Análisis empírico del juego 2048:
//   - Jugador novato: ~10-20 pts/movimiento promedio
//   - Jugador experto llegando a tile 2048: ~40 pts/mov (≈20.000 pts en 500 movs)
//   - Jugador excepcional llegando a 4096: ~100 pts/mov (≈100.000 pts en 1000 movs)
//   - Imposible en cualquier duración de torneo: >350 pts/mov sostenido en 20+ movs
//     (requeriría mergear tiles de 512+ continuamente desde el inicio, imposible en 2048)
const MAX_AVG_PTS_PER_MOVE = 350

// MIN_MOVES_FOR_SCORE_CHECK: no chequear en los primeros movimientos donde la varianza es alta.
const MIN_MOVES_FOR_SCORE_CHECK = 20

export interface AnticheatResult {
  suspicious: boolean
  reason?: 'bot_timing' | 'fast_move' | 'impossible_score'
  autoBanned?: boolean
}

/**
 * Analiza un movimiento recién procesado en busca de comportamiento de bot.
 * Llamar DESPUÉS de persistir el movimiento en game_moves.
 *
 * El análisis es asíncrono y no bloquea la respuesta al cliente, pero el
 * ban síncrono en la route /move rechazará los siguientes movimientos.
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

  // ── 1. Timing: movimientos imposiblemente rápidos ──────────────────────────
  // Solo aplica desde el segundo movimiento (necesitamos el anterior para comparar)
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

      // El timing primario usa server_timestamp, no datos controlados por el cliente.
      if (elapsed > 0 && elapsed < MIN_HUMAN_MOVE_MS) {
        // Obtener los últimos N+1 movimientos para verificar burst consecutivo
        const { data: recentMoves } = await supabase
          .from('game_moves')
          .select('server_timestamp')
          .eq('game_id', gameId)
          .order('move_number', { ascending: false })
          .limit(BOT_BURST_THRESHOLD + 1)

        if (recentMoves && recentMoves.length >= BOT_BURST_THRESHOLD) {
          let allFast = true
          for (let i = 0; i < recentMoves.length - 1; i++) {
            const interval =
              Date.parse(recentMoves[i]!.server_timestamp) -
              Date.parse(recentMoves[i + 1]!.server_timestamp)
            // Un intervalo no positivo o >= MIN_HUMAN_MOVE_MS rompe el burst
            if (interval >= MIN_HUMAN_MOVE_MS || interval <= 0) {
              allFast = false
              break
            }
          }

          if (allFast) {
            await applyAutoBan(
              userId,
              `Bot detectado: ${BOT_BURST_THRESHOLD} movimientos consecutivos < ${MIN_HUMAN_MOVE_MS}ms (último intervalo: ${elapsed}ms)`
            )
            return { suspicious: true, reason: 'bot_timing', autoBanned: true }
          }
        }

        // Un solo movimiento ultra-rápido: sospechoso pero no ban inmediato
        return { suspicious: true, reason: 'fast_move' }
      }

      // Timestamp de cliente manipulado: no se usa para calcular jugadas, pero sí para fraude.
      if (clientElapsed <= 0 && moveCount > 2) {
        await applyAutoBan(userId, `Timestamp de cliente manipulado: elapsed=${clientElapsed}ms en movimiento ${moveNumber}`)
        return { suspicious: true, reason: 'bot_timing', autoBanned: true }
      }
    }
  }

  // ── 2. Score promedio imposible ────────────────────────────────────────────
  // Solo evaluar después de suficientes movimientos para tener estadística fiable
  if (moveCount >= MIN_MOVES_FOR_SCORE_CHECK) {
    const avgScorePerMove = currentScore / moveCount
    if (avgScorePerMove > MAX_AVG_PTS_PER_MOVE) {
      await applyAutoBan(
        userId,
        `Score imposible: promedio ${avgScorePerMove.toFixed(0)} pts/movimiento ` +
        `(${currentScore} pts en ${moveCount} movs, umbral: ${MAX_AVG_PTS_PER_MOVE} pts/mov)`
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
