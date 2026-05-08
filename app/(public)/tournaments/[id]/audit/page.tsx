import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTimeCL } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Game, Tournament, TournamentResult } from '@/types/database'

export const revalidate = 60

export default async function TournamentAuditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: tData }, { data: results }, { data: games }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).single(),
    supabase
      .from('tournament_results')
      .select('user_id, rank, final_score, prize_awarded_cents, created_at')
      .eq('tournament_id', id)
      .order('rank', { ascending: true }),
    supabase
      .from('games')
      .select('id, user_id, seed, status, final_score, highest_tile, move_count, started_at, ended_at, end_reason')
      .eq('tournament_id', id)
      .order('final_score', { ascending: false })
      .order('highest_tile', { ascending: false })
      .order('move_count', { ascending: true }),
  ])

  if (!tData) notFound()
  const tournament = tData as Tournament
  const gameRows = (games ?? []) as Game[]
  const resultRows = (results ?? []) as TournamentResult[]
  const gameIds = gameRows.map((game) => game.id)

  const [{ data: moves }, { data: profiles }] = await Promise.all([
    gameIds.length
      ? supabase.from('game_moves').select('game_id').in('game_id', gameIds)
      : Promise.resolve({ data: [] as Array<{ game_id: string }> }),
    gameRows.length
      ? supabase.from('profiles').select('id, username').in('id', gameRows.map((game) => game.user_id))
      : Promise.resolve({ data: [] as Array<{ id: string; username: string }> }),
  ])

  const moveCountByGame = new Map<string, number>()
  for (const move of moves ?? []) {
    moveCountByGame.set(move.game_id, (moveCountByGame.get(move.game_id) ?? 0) + 1)
  }

  const resultByUser = new Map(resultRows.map((result) => [result.user_id, result]))
  const usernameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]))

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/tournaments/${id}/leaderboard`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Ranking
          </Link>
          <h1 className="text-2xl font-bold mt-3">Auditoría del torneo</h1>
          <p className="text-sm text-muted-foreground mt-1">{tournament.name}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {tournament.status === 'completed' ? 'Finalizado' : 'Disponible al finalizar'}
        </span>
      </div>

      {tournament.status !== 'completed' ? (
        <div className="border rounded-xl p-6 text-sm text-muted-foreground">
          La auditoría pública se publica cuando el torneo termina y el ranking queda cerrado.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <AuditCard label="Partidas registradas" value={String(gameRows.length)} />
            <AuditCard label="Resultados oficiales" value={String(resultRows.length)} />
            <AuditCard label="Premios fijos" value="Publicados antes del pago" />
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[3rem_1fr_auto_auto_auto] gap-3 bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>#</span>
              <span>Jugador</span>
              <span className="text-right">Puntaje</span>
              <span className="text-right">Movs</span>
              <span className="text-right">Seed</span>
            </div>
            {gameRows.map((game) => {
              const result = resultByUser.get(game.user_id)

              return (
                <div
                  key={game.id}
                  className="grid grid-cols-[3rem_1fr_auto_auto_auto] items-center gap-3 border-t px-4 py-3 text-sm"
                >
                  <span className="font-mono text-muted-foreground">{result?.rank ?? '-'}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{usernameById.get(game.user_id) ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {game.started_at ? formatDateTimeCL(game.started_at) : 'sin inicio'}
                      {game.end_reason ? ` · ${game.end_reason}` : ''}
                    </p>
                  </div>
                  <span className="text-right font-mono font-semibold">
                    {game.final_score.toLocaleString('es-CL')}
                  </span>
                  <span className="text-right text-muted-foreground">
                    {moveCountByGame.get(game.id) ?? game.move_count}
                  </span>
                  <span className="text-right font-mono text-xs text-muted-foreground">
                    {fingerprintSeed(game.seed)}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            La auditoría muestra huella de seed, timestamps de servidor y conteo de movimientos.
            El backend calcula el ranking y los premios; el cliente no puede enviar puntajes finales
            ni seeds para modificar el resultado oficial.
          </p>
        </>
      )}
    </div>
  )
}

function AuditCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function fingerprintSeed(seed: string) {
  if (seed.length <= 16) return seed
  return `${seed.slice(0, 8)}...${seed.slice(-8)}`
}
