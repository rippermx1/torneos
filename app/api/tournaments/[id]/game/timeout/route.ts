import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { isPastGameDeadline } from '@/lib/tournament/game-deadline'
import { closeExpiredGame } from '@/lib/tournament/close-expired-game'
import { GAME_SNAPSHOT_FIELDS, gameSnapshotResponse, type SnapshotGame } from '@/lib/tournament/game-snapshot-response'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'
import { isJsonObject, isGameId } from '@/lib/tournament/game-request'
import type { Tournament } from '@/types/database'

interface TimeoutRequest {
  gameId?: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId
  const rateLimit = await checkRateLimit({
    key: `game:timeout:${userId}`,
    limit: 30,
    windowMs: 60_000,
    onError: 'deny',
  })
  if (!rateLimit.ok) return rateLimitResponse(rateLimit)

  let body: TimeoutRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!isJsonObject(body) || !isGameId(body.gameId)) {
    return Response.json({ error: 'gameId requerido' }, { status: 400 })
  }

  const { id: tournamentId } = await params
  const supabase = createAdminClient()

  const [
    { data: gameData },
    { data: tournamentData },
  ] = await Promise.all([
    supabase
      .from('games')
      .select(GAME_SNAPSHOT_FIELDS)
      .eq('id', body.gameId)
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('tournaments')
      .select('id, status, play_window_start, play_window_end, max_game_duration_seconds')
      .eq('id', tournamentId)
      .single(),
  ])

  if (!gameData) return Response.json({ error: 'Partida no encontrada' }, { status: 404 })
  if (!tournamentData) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })

  const game = gameData as SnapshotGame
  const tournament = tournamentData as Pick<
    Tournament,
    'status' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'
  >

  if (game.status !== 'active') {
    return gameSnapshotResponse(game, tournament.play_window_end, tournament.max_game_duration_seconds)
  }

  if (!game.started_at) {
    return Response.json({ error: 'La partida no tiene fecha de inicio' }, { status: 400 })
  }

  const playability = checkPlayWindow(tournament)
  const reachedGameDeadline = isPastGameDeadline(
    game.started_at,
    tournament.play_window_end,
    tournament.max_game_duration_seconds
  )
  const reachedWindowDeadline = !playability.ok && (
    playability.reason === 'window_closed' ||
    playability.reason === 'completed'
  )

  if (!reachedGameDeadline && !reachedWindowDeadline) {
    return gameSnapshotResponse(game, tournament.play_window_end, tournament.max_game_duration_seconds)
  }

  const closure = await closeExpiredGame(supabase, { gameId: game.id, tournamentId, userId })
  if (!closure.ok) return closure.response

  return gameSnapshotResponse(closure.game, tournament.play_window_end, tournament.max_game_duration_seconds)
}
