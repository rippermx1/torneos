import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Tournament, Game } from '@/types/database'

export default async function TournamentGamesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: tData }, { data: gamesData }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase
      .from('games')
      .select('*')
      .eq('tournament_id', id)
      .order('final_score', { ascending: false }),
  ])

  if (!tData) notFound()
  const tournament = tData as Tournament
  const games = (gamesData ?? []) as Game[]

  const userIds = games.map((g) => g.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  const usernameMap = Object.fromEntries(
    (profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username])
  )

  const STATUS_STYLE: Record<Game['status'], string> = {
    not_started: 'text-slate-400',
    active: 'text-amber-600',
    completed: 'text-green-600',
    abandoned: 'text-slate-400',
    invalid: 'text-red-600',
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/tournaments" className="text-sm text-muted-foreground hover:text-foreground">
          ← Torneos
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Partidas</h1>
          <p className="text-sm text-muted-foreground">{tournament.name} · {games.length} partidas</p>
        </div>
      </div>

      {games.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nadie ha jugado aún.</p>
      ) : (
        <div className="border rounded-xl divide-y overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
            <span>Jugador</span>
            <span>Estado</span>
            <span className="text-right">Score</span>
            <span className="text-right">Tile</span>
            <span className="text-right">Movimientos</span>
            <span>Acciones</span>
          </div>
          {games.map((g) => (
            <div
              key={g.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 px-4 py-3 items-center text-sm"
            >
              <span className="font-medium truncate">{usernameMap[g.user_id] ?? '—'}</span>
              <span className={`text-xs font-medium ${STATUS_STYLE[g.status]}`}>
                {g.status}
              </span>
              <span className="text-right font-mono font-semibold">
                {Number(g.final_score).toLocaleString('es-CL')}
              </span>
              <span className="text-right text-muted-foreground">{g.highest_tile || '—'}</span>
              <span className="text-right text-muted-foreground">{g.move_count}</span>
              <Link
                href={`/admin/tournaments/${id}/games/${g.id}`}
                className="text-xs border rounded-lg px-2 py-1 hover:bg-muted transition-colors"
              >
                Revisar
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
