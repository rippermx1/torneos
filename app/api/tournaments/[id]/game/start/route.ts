import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG, generateGameSeed, computeRngStates, RNG_PREVIEW_SIZE } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { isPastGameDeadline } from '@/lib/tournament/game-deadline'
import { closeExpiredGame } from '@/lib/tournament/close-expired-game'
import { GAME_SNAPSHOT_FIELDS, gameSnapshotResponse, type SnapshotGame } from '@/lib/tournament/game-snapshot-response'
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

  let recovery: { recoverOnly?: boolean; gameId?: string } = {}
  if (req.body) {
    try { recovery = await req.json() } catch { return Response.json({ error: 'Body JSON inválido' }, { status: 400 }) }
    if (!recovery || typeof recovery !== 'object') return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { id: tournamentId } = await params
  const supabase = createAdminClient()

  const [
    { data: profile },
    { data: tournament },
    { data: registration },
    { data: existingGameData, error: existingGameError },
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
      .select(`${GAME_SNAPSHOT_FIELDS}, seed`)
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (profile?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })
  const tournamentState = tournament as Pick<
    Tournament,
    'id' | 'status' | 'min_players' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'
  >

  if (!registration) return Response.json({ error: 'No estás inscrito en este torneo' }, { status: 403 })
  if (existingGameError) return Response.json({ error: 'No se pudo recuperar la partida.', code: 'GAME_STATE_UNCONFIRMED' }, { status: 503 })
  const existingGame = existingGameData as (SnapshotGame & Pick<Game, 'seed'>) | null
  if (recovery.recoverOnly && (!existingGame || existingGame.id !== recovery.gameId)) {
    return Response.json({ error: 'No se pudo recuperar la partida solicitada.', code: 'GAME_STATE_UNCONFIRMED' }, { status: 409 })
  }
  // Reading an owned result remains possible after the tournament window closes.
  if (existingGame && existingGame.status !== 'active') {
    return gameSnapshotResponse(existingGame, tournamentState.play_window_end,
      tournamentState.max_game_duration_seconds, { resuming: true, nextRngStates: [] })
  }

  const playability = checkPlayWindow(tournamentState)
  if (existingGame && existingGame.started_at && (isPastGameDeadline(existingGame.started_at,
    tournamentState.play_window_end, tournamentState.max_game_duration_seconds)
    || !playability.ok && ['window_closed','completed'].includes(playability.reason))) {
    const closure = await closeExpiredGame(supabase, { gameId: existingGame.id, tournamentId, userId })
    if (!closure.ok) return closure.response
    return gameSnapshotResponse(closure.game, tournamentState.play_window_end,
      tournamentState.max_game_duration_seconds, { resuming: true, nextRngStates: [] })
  }
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

  if (existingGame) {
    const game = existingGame
    // Retornar estado actual para reanudar
    const resumeMoveNumber = game.move_count + 2 // +2 por los dos spawns iniciales
    return gameSnapshotResponse(game, tournamentState.play_window_end, tournamentState.max_game_duration_seconds, {
      nextRngStates: computeRngStates(game.seed, resumeMoveNumber, RNG_PREVIEW_SIZE),
      nextRngStatesFrom: resumeMoveNumber,
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

  // Two tabs can both observe no game before either INSERT commits. The unique
  // constraint picks the winner; recover its owned row rather than retrying.
  if (insertErr?.code === '23505') {
    const persisted = await supabase.from('games').select(`${GAME_SNAPSHOT_FIELDS}, seed`)
      .eq('tournament_id', tournamentId).eq('user_id', userId).maybeSingle()
    if (persisted.error || !persisted.data) {
      return Response.json({ error: 'No se pudo confirmar la partida. Recupera su estado.',
        code: 'GAME_STATE_UNCONFIRMED' }, { status: 503 })
    }
    const game = persisted.data as SnapshotGame & Pick<Game, 'seed'>
    const next = game.move_count + 2
    return gameSnapshotResponse(game, tournamentState.play_window_end, tournamentState.max_game_duration_seconds, {
      resuming: true,
      nextRngStates: game.status === 'active' ? computeRngStates(game.seed, next, RNG_PREVIEW_SIZE) : [],
      nextRngStatesFrom: next,
    })
  }
  if (insertErr || !newGame) {
    return Response.json({ error: `Error creando partida: ${insertErr?.message}` }, { status: 500 })
  }

  return gameSnapshotResponse({ id: newGame.id, status: 'active', current_board: gameBoard.board,
    final_score: 0, move_count: 0, started_at: startedAt, end_reason: null, ended_at: null },
    tournamentState.play_window_end, tournamentState.max_game_duration_seconds, {
    nextRngStates: computeRngStates(seed, 2, RNG_PREVIEW_SIZE),
    nextRngStatesFrom: 2,
    resuming: false,
  })
}
