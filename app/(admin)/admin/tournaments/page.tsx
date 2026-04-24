import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import Link from 'next/link'
import type { Tournament } from '@/types/database'
import { TournamentActions } from '@/components/tournament/tournament-actions'

const STATUS_LABEL: Record<Tournament['status'], string> = {
  scheduled: 'Programado',
  open: 'Inscripciones abiertas',
  live: 'En curso',
  finalizing: 'Finalizando',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const STATUS_DOT: Record<Tournament['status'], string> = {
  scheduled: 'bg-slate-400',
  open: 'bg-green-500',
  live: 'bg-amber-500',
  finalizing: 'bg-orange-500',
  completed: 'bg-slate-300',
  cancelled: 'bg-red-400',
}

export default async function AdminTournamentsPage() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .order('play_window_start', { ascending: false })
    .limit(50)

  const tournaments = (data ?? []) as Tournament[]

  // Conteo de inscriptos por torneo
  const counts: Record<string, number> = {}
  if (tournaments.length > 0) {
    const ids = tournaments.map((t) => t.id)
    const { data: regs } = await supabase
      .from('registrations')
      .select('tournament_id')
      .in('tournament_id', ids)

    for (const r of regs ?? []) {
      const reg = r as { tournament_id: string }
      counts[reg.tournament_id] = (counts[reg.tournament_id] ?? 0) + 1
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Torneos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            El cron actualiza estados automáticamente cada minuto.
          </p>
        </div>
        <Link
          href="/admin/tournaments/new"
          className="bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Crear torneo
        </Link>
      </div>

      {tournaments.length === 0 && (
        <p className="text-muted-foreground text-sm">No hay torneos aún.</p>
      )}

      <div className="space-y-3">
        {tournaments.map((t) => {
          const playerCount = counts[t.id] ?? 0
          const canFinalize = t.status === 'live' || t.status === 'finalizing'

          return (
            <div key={t.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status]}`} />
                    <h2 className="font-semibold">{t.name}</h2>
                    <span className="text-xs text-muted-foreground">{STATUS_LABEL[t.status]}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-4">
                    Inicio: {formatDateTimeCL(t.play_window_start)} ·
                    Cierre: {formatDateTimeCL(t.play_window_end)}
                  </p>
                </div>
                <div className="text-right shrink-0 text-sm">
                  <p className="font-medium">{formatCLP(t.entry_fee_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {playerCount} / {t.max_players} jugadores
                    {playerCount < t.min_players && t.status !== 'completed' && t.status !== 'cancelled'
                      ? ` (mín ${t.min_players})`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Link
                  href={`/tournaments/${t.id}`}
                  className="text-xs border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  Ver torneo
                </Link>
                <Link
                  href={`/tournaments/${t.id}/leaderboard`}
                  className="text-xs border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  Ranking
                </Link>
                {canFinalize && (
                  <TournamentActions tournamentId={t.id} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
