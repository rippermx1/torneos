import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import { calculateGameDeadline, isPastGameDeadline } from '@/lib/tournament/game-deadline'
import type { Game, Tournament } from '@/types/database'

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

  let body: TimeoutRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.gameId) {
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
      .select('id, status, final_score, started_at, end_reason')
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

  const game = gameData as Pick<Game, 'id' | 'status' | 'final_score' | 'started_at' | 'end_reason'>
  const tournament = tournamentData as Pick<
    Tournament,
    'status' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'
  >

  if (game.status !== 'active') {
    return Response.json({
      timedOut: game.end_reason === 'timeout',
      score: game.final_score,
    })
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
    return Response.json({
      timedOut: false,
      score: game.final_score,
      deadlineAt: calculateGameDeadline(
        game.started_at,
        tournament.play_window_end,
        tournament.max_game_duration_seconds
      ),
    })
  }

  const endedAt = new Date().toISOString()
  await supabase
    .from('games')
    .update({
      status: 'completed',
      end_reason: 'timeout',
      ended_at: endedAt,
    })
    .eq('id', game.id)
    .eq('status', 'active')

  return Response.json({
    timedOut: true,
    score: game.final_score,
    endedAt,
  })
}
