import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { isPastGameDeadline } from '@/lib/tournament/game-deadline'
import { analyzeMove } from '@/lib/anticheat/detector'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import type { Game, Direction } from '@/types/database'

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
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `game:move:${userId}:${getRequestIp(req)}`,
    limit: 240,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

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

  const [
    { data: profileCheck },
    { data: gameData },
    { data: tournament },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', userId)
      .single(),
    supabase
      .from('games')
      .select('id, status, move_count, current_board, final_score, seed, started_at')
      .eq('id', gameId)
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('tournaments')
      .select('id, status, play_window_start, play_window_end, max_game_duration_seconds')
      .eq('id', tournamentId)
      .single(),
  ])

  if (profileCheck?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  if (!gameData) return Response.json({ error: 'Partida no encontrada' }, { status: 404 })

  const game = gameData as Pick<
    Game,
    'status' | 'move_count' | 'current_board' | 'final_score' | 'seed' | 'started_at'
  >
  if (game.status !== 'active') {
    return Response.json({ error: 'La partida no está activa' }, { status: 400 })
  }

  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })

  const playability = checkPlayWindow(tournament)
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
      .eq('status', 'active')

    return Response.json({ error: 'La ventana de juego cerró', timeout: true }, { status: 400 })
  }

  if (
    game.started_at &&
    isPastGameDeadline(
      game.started_at,
      tournament.play_window_end,
      tournament.max_game_duration_seconds
    )
  ) {
    await supabase
      .from('games')
      .update({
        status: 'completed',
        end_reason: 'timeout',
        ended_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('status', 'active')

    return Response.json({ error: 'La partida alcanzó su duración máxima', timeout: true }, { status: 400 })
  }

  // Verificar que el moveNumber es el siguiente esperado
  const expectedMoveNumber = game.move_count + 2
  if (moveNumber !== expectedMoveNumber) {
    return Response.json({
      error: `moveNumber fuera de orden: esperado ${expectedMoveNumber}, recibido ${moveNumber}`,
    }, { status: 409 })
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
  const { data: insertedMove, error: moveErr } = await supabase
    .from('game_moves')
    .insert({
      game_id: gameId,
      move_number: moveNumber,
      direction,
      board_before: board,
      board_after: engine.board,
      score_gained: result.scoreGained,
      spawned_tile: result.spawnedTile,
      client_timestamp: clientTimestamp,
    })
    .select('server_timestamp')
    .single()

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

  // A2: Analisis anticheat sincrono. Antes era fire-and-forget pero en
  // entornos serverless (Vercel) la lambda puede terminar antes de que la
  // promise resuelva, perdiendo bans. Ademas, si el movimiento actual es
  // el que dispara el ban, queremos rechazarlo aqui mismo en vez de dejar
  // pasar uno mas. Costo: 1-2 SELECT extra por movimiento (acotado por el
  // rate limit de 240/min).
  let anticheat: Awaited<ReturnType<typeof analyzeMove>>
  try {
    anticheat = await analyzeMove({
      gameId,
      userId,
      moveNumber,
      clientTimestamp,
      serverTimestamp: insertedMove?.server_timestamp,
      moveCount: newMoveCount,
      currentScore: engine.score,
    })
  } catch (err) {
    // Fail-open: si el detector falla, no bloqueamos el juego. El ban
    // sintetico se reevaluara en el siguiente movimiento.
    console.error('[anticheat] Error en analisis:', err)
    anticheat = { suspicious: false }
  }

  if (anticheat.autoBanned) {
    console.warn(`[anticheat] Usuario ${userId} baneado automaticamente. Razon: ${anticheat.reason}`)
    return Response.json(
      { error: 'Cuenta suspendida por comportamiento sospechoso.' },
      { status: 403 }
    )
  }

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
