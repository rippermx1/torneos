import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG, computeRngStates, RNG_PREVIEW_SIZE } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { isPastGameDeadline } from '@/lib/tournament/game-deadline'
import { analyzeMove } from '@/lib/anticheat/detector'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import type { Game, Tournament, Direction } from '@/types/database'

// ── Tournament cache ─────────────────────────────────────────────────────────
// Tournament rows are immutable during the play window (status, window dates,
// max_game_duration_seconds never change mid-game). Caching them eliminates
// one DB round-trip on every move request after the first.
type TournamentRow = Pick<
  Tournament,
  'id' | 'status' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'
>
type CacheEntry = { data: TournamentRow; expiresAt: number }
const tournamentCache = new Map<string, CacheEntry>()
const TOURNAMENT_TTL_MS = 5 * 60 * 1_000 // 5 min

async function getTournament(
  supabase: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<TournamentRow | null> {
  const cached = tournamentCache.get(tournamentId)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const { data } = await supabase
    .from('tournaments')
    .select('id, status, play_window_start, play_window_end, max_game_duration_seconds')
    .eq('id', tournamentId)
    .single()

  if (!data) return null
  tournamentCache.set(tournamentId, {
    data: data as TournamentRow,
    expiresAt: Date.now() + TOURNAMENT_TTL_MS,
  })
  return data as TournamentRow
}
// ────────────────────────────────────────────────────────────────────────────

interface MoveRequest {
  gameId: string
  direction: Direction
  moveNumber: number
  clientTimestamp: number
  // Posición optimista del cliente (puede estar adelantado por movimientos rápidos
  // ya aplicados visualmente pero aún encolados al servidor). Permite al servidor
  // enviar estados RNG relevantes a la posición actual del cliente en vez de
  // estados ya consumidos por el buffer optimista.
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

  const { gameId, direction, moveNumber, clientTimestamp, clientCurrentMoveNumber } = body

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

  // tournament is served from in-process cache after the first request;
  // profile + game always hit the DB (ban status must be fresh, game state changes every move).
  const [
    { data: profileCheck },
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
      .select('id, status, move_count, current_board, final_score, seed, started_at')
      .eq('id', gameId)
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single(),
    getTournament(supabase, tournamentId),
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
    return Response.json({ error: `Error guardando movimiento: ${rpcErr.message}` }, { status: 500 })
  }

  // Anticheat corre DESPUÉS de responder usando after() (= waitUntil de Vercel).
  // El ban queda escrito en DB antes de que el siguiente movimiento pase el check
  // is_banned al inicio de esta route, por lo que bots quedan bloqueados en el
  // movimiento N+1. Ganancia: ~50-200ms por movimiento al eliminar los SELECT
  // extra que antes bloqueaban sincrónamente la respuesta.
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

  // Estados RNG para los próximos N movimientos. Permiten al cliente reproducir
  // localmente los spawns del servidor sin recibir el seed → gameplay fluido sin
  // exponer información que comprometa el anti-cheat.
  //
  // Se envían desde max(moveNumber+1, clientCurrentMoveNumber) para que ráfagas
  // rápidas (cliente adelantado al servidor) reciban estados útiles y no estados
  // que el cliente ya consumió. El cap MAX_AHEAD previene que un cliente malicioso
  // pida estados muy adelantados para precomputar la partida.
  const MAX_AHEAD = 20
  const requestedStart = typeof clientCurrentMoveNumber === 'number'
    ? Math.min(clientCurrentMoveNumber, moveNumber + 1 + MAX_AHEAD)
    : moveNumber + 1
  const nextRngStatesStart = Math.max(moveNumber + 1, requestedStart)
  const nextRngStates = gameOver ? [] : computeRngStates(game.seed, nextRngStatesStart, RNG_PREVIEW_SIZE)

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
  })
}
