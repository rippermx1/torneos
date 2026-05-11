import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG, generateGameSeed } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { calculateGameDeadline, isPastGameDeadline } from '@/lib/tournament/game-deadline'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/security/rate-limit'
import type { Game, Tournament } from '@/types/database'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `game:start:${userId}:${getRequestIp(req)}`,
    limit: 15,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  const { id: tournamentId } = await params
  const supabase = createAdminClient()

  const [
    { data: profile },
    { data: tournament },
    { data: registration },
    { data: existingGameData },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', userId)
      .single(),
    supabase
      .from('tournaments')
      .select('id, status, min_players, play_window_start, play_window_end, max_game_duration_seconds')
      .eq('id', tournamentId)
      .single(),
    supabase
      .from('registrations')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('games')
      .select('id, status, current_board, final_score, move_count, seed, started_at')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single(),
  ])

  if (profile?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })
  const tournamentState = tournament as Pick<
    Tournament,
    'id' | 'status' | 'min_players' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'
  >

  const playability = checkPlayWindow(tournamentState)
  if (!playability.ok) {
    return Response.json({ error: playability.reason }, { status: 400 })
  }

  if (tournamentState.status !== 'live') {
    if (tournamentState.status !== 'open' && tournamentState.status !== 'scheduled') {
      return Response.json({ error: 'El torneo no está disponible para iniciar partidas' }, { status: 400 })
    }

    const { count } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

    const playerCount = count ?? 0
    if (playerCount < tournamentState.min_players) {
      await supabase.rpc('cancel_tournament', { p_tournament_id: tournamentId })
      return Response.json(
        { error: 'El torneo fue cancelado porque no alcanzó el mínimo de participantes.' },
        { status: 409 }
      )
    }

    const { error: liveError } = await supabase
      .from('tournaments')
      .update({ status: 'live' })
      .eq('id', tournamentId)
      .in('status', ['scheduled', 'open'])

    if (liveError) {
      return Response.json({ error: `Error activando torneo: ${liveError.message}` }, { status: 500 })
    }
  }

  if (!registration) {
    return Response.json({ error: 'No estás inscrito en este torneo' }, { status: 403 })
  }

  if (existingGameData) {
    const game = existingGameData as Pick<
      Game,
      'id' | 'status' | 'current_board' | 'final_score' | 'move_count' | 'seed' | 'started_at'
    >
    if (game.status === 'completed' || game.status === 'abandoned') {
      return Response.json({ error: 'Tu partida en este torneo ya finalizó' }, { status: 400 })
    }
    if (
      game.started_at &&
      isPastGameDeadline(
        game.started_at,
        tournamentState.play_window_end,
        tournamentState.max_game_duration_seconds
      )
    ) {
      await supabase
        .from('games')
        .update({
          status: 'completed',
          end_reason: 'timeout',
          ended_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('status', 'active')

      return Response.json({ error: 'Tu partida alcanzó su duración máxima', timeout: true }, { status: 400 })
    }

    // Retornar estado actual para reanudar
    return Response.json({
      gameId: game.id,
      board: game.current_board,
      score: game.final_score,
      moveCount: game.move_count,
      moveNumber: game.move_count + 2, // +2 por los dos spawns iniciales
      deadlineAt: game.started_at
        ? calculateGameDeadline(
            game.started_at,
            tournamentState.play_window_end,
            tournamentState.max_game_duration_seconds
          )
        : tournamentState.play_window_end,
      resuming: true,
    })
  }

  // Crear nueva partida
  const seed = generateGameSeed()
  const gameBoard = new Game2048()
  gameBoard.spawnTile(new DeterministicRNG(seed, 0))
  gameBoard.spawnTile(new DeterministicRNG(seed, 1))
  const startedAt = new Date().toISOString()

  const { data: newGame, error: insertErr } = await supabase
    .from('games')
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      seed,
      status: 'active',
      final_score: 0,
      highest_tile: 0,
      move_count: 0,
      current_board: gameBoard.board,
      started_at: startedAt,
    })
    .select('id')
    .single()

  if (insertErr || !newGame) {
    return Response.json({ error: `Error creando partida: ${insertErr?.message}` }, { status: 500 })
  }

  return Response.json({
    gameId: newGame.id,
    board: gameBoard.board,
    score: 0,
    moveCount: 0,
    moveNumber: 2,
    deadlineAt: calculateGameDeadline(
      startedAt,
      tournamentState.play_window_end,
      tournamentState.max_game_duration_seconds
    ),
    resuming: false,
  })
}
