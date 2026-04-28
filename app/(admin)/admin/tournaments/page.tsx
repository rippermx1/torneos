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

interface PrizeLiability {
  committed_cents: number
  contingent_cents: number
  collected_cents: number
  active_count: number
  pending_count: number
}

export default async function AdminTournamentsPage() {
  const supabase = createAdminClient()
  const [{ data }, { data: liabilityRow }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('*')
      .order('play_window_start', { ascending: false })
      .limit(50),
    supabase.from('prize_liability').select('*').single(),
  ])

  const tournaments = (data ?? []) as Tournament[]
  const liability = (liabilityRow ?? {
    committed_cents: 0,
    contingent_cents: 0,
    collected_cents: 0,
    active_count: 0,
    pending_count: 0,
  }) as PrizeLiability

  // Cobertura: ingresos recaudados vs premios comprometidos (torneos live/finalizing)
  const coverage = liability.committed_cents > 0
    ? liability.collected_cents / liability.committed_cents
    : 1
  const coverageOk = coverage >= 1

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

      {/* ── Panel de pasivo de premios ── */}
      <div className={`border rounded-xl p-4 space-y-3 ${!coverageOk ? 'border-red-400 bg-red-50' : 'border-border bg-muted/30'}`}>
        <div className="flex items-center justify-between">
          <p className={`text-sm font-semibold ${!coverageOk ? 'text-red-700' : 'text-foreground'}`}>
            {!coverageOk ? '⚠️ Alerta financiera: cobertura insuficiente' : '✓ Salud financiera de torneos'}
          </p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coverageOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            Cobertura {(coverage * 100).toFixed(0)}%
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Premios comprometidos</p>
            <p className="font-semibold text-red-700">{formatCLP(liability.committed_cents)}</p>
            <p className="text-xs text-muted-foreground">{liability.active_count} torneos activos</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Ingresos recaudados</p>
            <p className="font-semibold text-green-700">{formatCLP(liability.collected_cents)}</p>
            <p className="text-xs text-muted-foreground">Cuotas cobradas</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Pasivo contingente</p>
            <p className="font-semibold text-amber-700">{formatCLP(liability.contingent_cents)}</p>
            <p className="text-xs text-muted-foreground">{liability.pending_count} torneos pendientes</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Resultado estimado</p>
            <p className={`font-semibold ${liability.collected_cents >= liability.committed_cents ? 'text-green-700' : 'text-red-700'}`}>
              {formatCLP(liability.collected_cents - liability.committed_cents)}
            </p>
            <p className="text-xs text-muted-foreground">Recaudado − Comprometido</p>
          </div>
        </div>
        {!coverageOk && (
          <p className="text-xs text-red-700 border-t border-red-200 pt-2">
            Los ingresos recaudados no cubren los premios comprometidos en torneos activos.
            Asegúrate de tener fondos suficientes antes de crear nuevos torneos.
          </p>
        )}
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
