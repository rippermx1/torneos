import { createAdminClient } from '@/lib/supabase/server'
import { requireUserRole } from '@/lib/supabase/auth'
import { notFound } from 'next/navigation'
import { checkPlayWindow, PLAY_WINDOW_ERROR } from '@/lib/tournament/helpers'
import { formatDateTimeCL } from '@/lib/utils'
import { GameBoardClient } from '@/components/game/game-board-client'
import Link from 'next/link'
import type { Tournament } from '@/types/database'

export default async function TournamentPlayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const access = await requireUserRole()
  const userId = access.userId

  const supabase = createAdminClient()

  const { data: tData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single()

  if (!tData) notFound()
  const tournament = tData as Tournament

  // Verificar inscripción
  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('tournament_id', id)
    .eq('user_id', userId)
    .single()

  if (!registration) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-lg font-medium">No estás inscrito en este torneo.</p>
        <Link href={`/tournaments/${id}`} className="text-sm underline underline-offset-4">
          Volver al torneo
        </Link>
      </div>
    )
  }

  const playability = checkPlayWindow(tournament)
  if (!playability.ok) {
    const isBeforeWindow = playability.reason === 'window_not_open'
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-lg font-medium">{PLAY_WINDOW_ERROR[playability.reason]}</p>
        {isBeforeWindow && (
          <p className="text-sm text-muted-foreground">
            Las partidas comienzan el {formatDateTimeCL(tournament.play_window_start)}
          </p>
        )}
        <Link href={`/tournaments/${id}/leaderboard`} className="text-sm underline underline-offset-4">
          Ver ranking
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-lg leading-tight">{tournament.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Partida competitiva · una oportunidad</p>
        </div>
        <Link
          href={`/tournaments/${id}/leaderboard`}
          className="text-sm border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors whitespace-nowrap"
        >
          Ranking
        </Link>
      </div>

      <GameBoardClient
        config={{
          startUrl: `/api/tournaments/${id}/game/start`,
          moveUrl: `/api/tournaments/${id}/game/move`,
          timeoutUrl: `/api/tournaments/${id}/game/timeout`,
          playWindowEnd: tournament.play_window_end,
        }}
      />

      <p className="text-xs text-center text-muted-foreground">
        Tienes una sola partida por torneo. Tu puntaje final queda registrado al terminar.
      </p>
    </div>
  )
}
