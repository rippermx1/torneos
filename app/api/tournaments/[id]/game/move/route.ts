import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { analyzeMove } from '@/lib/anticheat/detector'
import type { Tournament, Game, Direction } from '@/types/database'

interface MoveRequest {
  gameId: string
  direction: Direction
  moveNumber: number
  clientTimestamp: number
}

const VALID_DIRECTIONS = new Set<string>(['up', 'down', 'left', 'right'])

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  const { id: tournamentId } = await params

  let body: MoveRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { gameId, direction, moveNumber, clientTimestamp } = body

  if (!VALID_DIRECTIONS.has(direction)) {
    return Response.json({ error: `Dirección inválida: ${direction}` }, { status: 400 })
  }
  if (typeof moveNumber !== 'number' || moveNumber < 2) {
    return Response.json({ error: 'moveNumber inválido' }, { status: 400 })
  }
  if (typeof clientTimestamp !== 'number') {
    return Response.json({ error: 'clientTimestamp inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verificar ban síncrono — si el anticheat lo baneó en un movimiento previo,
  // los siguientes movimientos son rechazados inmediatamente.
  const { data: profileCheck } = await supabase
    .from('profiles')
    .select('is_banned')
    .eq('id', userId)
    .single()
  if (profileCheck?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  // Cargar juego verificando ownership
  const { data: gameData } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .single()

  if (!gameData) return Response.json({ error: 'Partida no encontrada' }, { status: 404 })

  const game = gameData as Game
  if (game.status !== 'active') {
    return Response.json({ error: 'La partida no está activa' }, { status: 400 })
  }

  // Verificar que el moveNumber es el siguiente esperado
  const expectedMoveNumber = game.move_count + 2
  if (moveNumber !== expectedMoveNumber) {
    return Response.json({
      error: `moveNumber fuera de orden: esperado ${expectedMoveNumber}, recibido ${moveNumber}`,
    }, { status: 409 })
  }

  // Verificar ventana de juego del torneo
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })

  const playability = checkPlayWindow(tournament as Tournament)
  if (!playability.ok) {
    // Ventana cerrada: marcar partida como timeout
    await supabase
      .from('games')
      .update({
        status: 'completed',
        end_reason: 'timeout',
        ended_at: new Date().toISOString(),
      })
      .eq('id', gameId)

    return Response.json({ error: 'La ventana de juego cerró', timeout: true }, { status: 400 })
  }

  // Aplicar movimiento
  const board = game.current_board ?? []
  const engine = new Game2048(board as number[][], Number(game.final_score))
  const rng = new DeterministicRNG(game.seed, moveNumber)
  const result = engine.applyMove(direction as Direction, rng)

  if (!result.moved) {
    return Response.json({ moved: false, board: engine.board, score: engine.score })
  }

  const gameOver = !engine.canMove()
  const newMoveCount = game.move_count + 1
  const now = new Date().toISOString()

  // Persistir movimiento en game_moves
  const { error: moveErr } = await supabase.from('game_moves').insert({
    game_id: gameId,
    move_number: moveNumber,
    direction,
    board_before: board,
    board_after: engine.board,
    score_gained: result.scoreGained,
    spawned_tile: result.spawnedTile,
    client_timestamp: clientTimestamp,
  })

  if (moveErr) {
    return Response.json({ error: `Error guardando movimiento: ${moveErr.message}` }, { status: 500 })
  }

  // Actualizar estado del juego
  const updatePayload: Record<string, unknown> = {
    current_board: engine.board,
    final_score: engine.score,
    highest_tile: engine.highestTile(),
    move_count: newMoveCount,
  }

  if (gameOver) {
    updatePayload.status = 'completed'
    updatePayload.end_reason = 'no_moves'
    updatePayload.ended_at = now
  }

  const { error: updateErr } = await supabase
    .from('games')
    .update(updatePayload)
    .eq('id', gameId)

  if (updateErr) {
    return Response.json({ error: `Error actualizando partida: ${updateErr.message}` }, { status: 500 })
  }

  // Análisis anticheat (asíncrono, no bloquea la respuesta al cliente).
  // El ban se aplica en la DB — el siguiente movimiento del usuario recibirá 403.
  analyzeMove({
    gameId,
    userId,
    moveNumber,
    clientTimestamp,
    moveCount: newMoveCount,
    currentScore: engine.score,
  }).then((ac) => {
    if (ac.autoBanned) {
      console.warn(`[anticheat] Usuario ${userId} baneado automáticamente. Razón: ${ac.reason}`)
    }
  }).catch((err) => {
    console.error('[anticheat] Error en análisis:', err)
  })

  return Response.json({
    moved: true,
    board: engine.board,
    score: engine.score,
    scoreGained: result.scoreGained,
    spawnedTile: result.spawnedTile,
    moveNumber: moveNumber + 1,
    gameOver,
  })
}
