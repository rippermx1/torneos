import { createClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import type { Tournament } from '@/types/database'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Torneos — Torneos 2048',
  description: 'Explora los torneos de 2048 disponibles y compite por premios en pesos chilenos.',
}

const STATUS_LABEL: Record<Tournament['status'], string> = {
  scheduled: 'Próximamente',
  open: 'Inscripciones abiertas',
  live: 'En curso',
  finalizing: 'Finalizando',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
}

const STATUS_COLOR: Record<Tournament['status'], string> = {
  scheduled: 'bg-slate-100 text-slate-700',
  open: 'bg-green-100 text-green-700',
  live: 'bg-amber-100 text-amber-700',
  finalizing: 'bg-orange-100 text-orange-700',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-100 text-red-700',
}

export default async function TournamentsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .in('status', ['scheduled', 'open', 'live'])
    .order('play_window_start', { ascending: true })

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-red-600">Error al cargar los torneos. Intenta de nuevo.</p>
      </div>
    )
  }

  const tournaments = (data ?? []) as Tournament[]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Torneos activos</h1>

      {tournaments.length === 0 && (
        <p className="text-muted-foreground">No hay torneos activos por ahora. Vuelve pronto.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {tournaments.map((t) => (
          <Link
            key={t.id}
            href={`/tournaments/${t.id}`}
            className="border rounded-xl p-5 space-y-3 hover:border-foreground transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-tight">{t.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLOR[t.status]}`}>
                {STATUS_LABEL[t.status]}
              </span>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>Inscripción: <span className="text-foreground font-medium">{formatCLP(t.entry_fee_cents)}</span></p>
              <p>
                1° Premio mín.:{' '}
                <span className="text-foreground font-medium">{formatCLP(t.prize_1st_cents)}</span>
              </p>
              <p>Inicio: {formatDateTimeCL(t.play_window_start)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
