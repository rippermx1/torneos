import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { calculateGameDeadline, isPastGameDeadline } from '@/lib/tournament/game-deadline'
import { closeExpiredGame } from '@/lib/tournament/close-expired-game'
import { GAME_SNAPSHOT_FIELDS, gameSnapshotResponse, type SnapshotGame } from '@/lib/tournament/game-snapshot-response'
import { analyzeMove } from '@/lib/anticheat/detector'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'
import { isJsonObject, isGameId, isMoveNumber, isClientTimestamp } from '@/lib/tournament/game-request'
import type { Game, Tournament, Direction } from '@/types/database'

// Tournament status and limits must be fresh if an operator changes them.
type TournamentRow = Pick<
  Tournament,
  'id' | 'status' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'
>

async function getTournament(
  supabase: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<TournamentRow | null> {
  const { data } = await supabase
    .from('tournaments')
    .select('id, status, play_window_start, play_window_end, max_game_duration_seconds')
    .eq('id', tournamentId)
    .single()

  if (!data) return null
  return data as TournamentRow
}
// ────────────────────────────────────────────────────────────────────────────

interface MoveRequest {
  gameId: string
  direction: Direction
  moveNumber: number
  clientTimestamp: number
  // Legacy wire field, validated but unused by the authoritative Unity client.
  clientCurrentMoveNumber?: number
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
    key: `game:move:${userId}`,
    limit: 240,
    windowMs: 60_000,
    onError: 'deny',
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  const { id: tournamentId } = await params

  let body: MoveRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!isJsonObject(body) || !isGameId(body.gameId)
    || Object.keys(body).some((key) => !['gameId', 'direction', 'moveNumber', 'clientTimestamp', 'clientCurrentMoveNumber'].includes(key))) {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  const { gameId, direction, moveNumber, clientTimestamp, clientCurrentMoveNumber } = body

  if (!VALID_DIRECTIONS.has(direction)) {
    return Response.json({ error: `Dirección inválida: ${direction}` }, { status: 400 })
  }
  if (!isMoveNumber(moveNumber) || clientCurrentMoveNumber !== undefined && !isMoveNumber(clientCurrentMoveNumber)) {
    return Response.json({ error: 'moveNumber inválido' }, { status: 400 })
  }
  if (!isClientTimestamp(clientTimestamp)) {
    return Response.json({ error: 'clientTimestamp inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const [
    { data: profileCheck, error: profileError },
    { data: gameData },
    tournament,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', userId)
      .single(),
    supabase
      .from('games')
      .select(`${GAME_SNAPSHOT_FIELDS}, seed`)
      .eq('id', gameId)
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single(),
    getTournament(supabase, tournamentId),
  ])

  if (profileError || !profileCheck || typeof profileCheck.is_banned !== 'boolean') {
    return Response.json({ error: 'No se pudo comprobar el estado de tu cuenta.' }, { status: 503 })
  }
  if (profileCheck.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  if (!gameData) return Response.json({ error: 'Partida no encontrada' }, { status: 404 })

  const game = gameData as SnapshotGame & Pick<Game, 'seed'>
  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })
  if (game.status !== 'active') {
    return gameSnapshotResponse(game, tournament.play_window_end, tournament.max_game_duration_seconds,
      { error: 'La partida no está activa', moved: false }, 400)
  }

  const playability = checkPlayWindow(tournament)
  if (!playability.ok) {
    // Ventana cerrada: marcar partida como timeout
    const closure = await closeExpiredGame(supabase, { gameId, tournamentId, userId })
    if (!closure.ok) return closure.response

    return gameSnapshotResponse(closure.game, tournament.play_window_end, tournament.max_game_duration_seconds,
      { error: 'La ventana de juego cerró', moved: false }, 400)
  }

  if (
    game.started_at &&
    isPastGameDeadline(
      game.started_at,
      tournament.play_window_end,
      tournament.max_game_duration_seconds
    )
  ) {
    const closure = await closeExpiredGame(supabase, { gameId, tournamentId, userId })
    if (!closure.ok) return closure.response

    return gameSnapshotResponse(closure.game, tournament.play_window_end, tournament.max_game_duration_seconds,
      { error: 'La partida alcanzó su duración máxima', moved: false }, 400)
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
  const deadlineAt = game.started_at ? calculateGameDeadline(game.started_at,
    tournament.play_window_end, tournament.max_game_duration_seconds) : tournament.play_window_end

  if (!result.moved) {
    return Response.json({ moved: false, board: engine.board, score: engine.score,
      deadlineAt, serverNow: new Date().toISOString() })
  }

  const gameOver = !engine.canMove()
  const newMoveCount = game.move_count + 1
  const now = new Date().toISOString()

  // Single RPC call = INSERT game_moves + UPDATE games in one DB round-trip
  // (replaces the two sequential awaits that existed before).
  // @ts-expect-error – record_game_move not yet in generated Supabase types
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('record_game_move', {
    p_game_id: gameId,
    p_move_number: moveNumber,
    p_direction: direction,
    p_board_before: board,
    p_board_after: engine.board,
    p_score_gained: result.scoreGained,
    p_spawned_tile: result.spawnedTile ?? null,
    p_client_timestamp: clientTimestamp,
    p_current_board: engine.board,
    p_final_score: engine.score,
    p_highest_tile: engine.highestTile(),
    p_move_count: newMoveCount,
    p_status: gameOver ? 'completed' : null,
    p_end_reason: gameOver ? 'no_moves' : null,
    p_ended_at: gameOver ? now : null,
  })

  if (rpcErr) {
    if (rpcErr.code === 'PT403') {
      return Response.json({ error: 'Tu cuenta ha sido suspendida.', code: 'ACCOUNT_SUSPENDED' }, { status: 403 })
    }
    // The atomic RPC can reject a calculation made before another tab or a
    // timeout committed. Read the owned winner; never replay the direction.
    if (rpcErr.code === 'PT409' || rpcErr.code === '23505') {
      const current = await supabase.from('games').select(GAME_SNAPSHOT_FIELDS)
        .eq('id', gameId).eq('tournament_id', tournamentId).eq('user_id', userId).single()
      if (current.error || !current.data) {
        return Response.json({ error: 'No se pudo confirmar el estado de la partida.',
          code: 'GAME_STATE_UNCONFIRMED' }, { status: 503 })
      }
      let persisted = current.data as SnapshotGame
      if (persisted.status === 'active' && persisted.started_at && isPastGameDeadline(
        persisted.started_at, tournament.play_window_end, tournament.max_game_duration_seconds)) {
        const closure = await closeExpiredGame(supabase, { gameId, tournamentId, userId })
        if (!closure.ok) return closure.response
        persisted = closure.game
      }
      return gameSnapshotResponse(persisted, tournament.play_window_end, tournament.max_game_duration_seconds,
        { error: 'El estado de la partida cambió. Recupera su estado antes de continuar.', moved: false },
        persisted.status === 'active' ? 409 : 400)
    }
    return Response.json({ error: `Error guardando movimiento: ${rpcErr.message}` }, { status: 500 })
  }

  // after() completes persisted-move analysis without blocking the response.
  // Concurrent requests may be accepted before a sanction is persisted.
  const serverTimestampForAnticheat =
    (rpcResult as unknown as Array<{ server_timestamp: string }> | null)?.[0]?.server_timestamp ?? null
  after(async () => {
    try {
      const anticheat = await analyzeMove({
        gameId,
        userId,
        moveNumber,
        clientTimestamp,
        serverTimestamp: serverTimestampForAnticheat,
        moveCount: newMoveCount,
        currentScore: engine.score,
      })
      if (anticheat.autoBanned) {
        console.warn(`[anticheat] Usuario ${userId} baneado. Razón: ${anticheat.reason}`)
      }
    } catch (err) {
      console.error('[anticheat] Error en análisis (fail-open):', err)
    }
  })

  // Unity renders confirmed spawns. Keep the legacy fields without publishing
  // future random states that would give automated players advance knowledge.
  const nextRngStatesStart = moveNumber + 1
  const nextRngStates: number[] = []

  if (gameOver) {
    const persisted = await supabase.from('games').select(GAME_SNAPSHOT_FIELDS).eq('id', gameId)
      .eq('tournament_id', tournamentId).eq('user_id', userId).single()
    if (persisted.error || !persisted.data || persisted.data.status === 'active') {
      return Response.json({ error: 'No se pudo recuperar el resultado persistido.', code: 'GAME_STATE_UNCONFIRMED' }, { status: 503 })
    }
    return gameSnapshotResponse(persisted.data, tournament.play_window_end, tournament.max_game_duration_seconds,
      { moved: true, scoreGained: result.scoreGained, spawnedTile: result.spawnedTile, nextRngStates: [], nextRngStatesFrom: nextRngStatesStart })
  }

  return Response.json({
    moved: true,
    board: engine.board,
    score: engine.score,
    scoreGained: result.scoreGained,
    spawnedTile: result.spawnedTile,
    moveNumber: moveNumber + 1,
    nextRngStates,
    nextRngStatesFrom: nextRngStatesStart,
    gameOver,
    deadlineAt,
    serverNow: new Date().toISOString(),
  })
}
