import { createClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Tournament } from '@/types/database'
import { loadTournamentLeaderboard } from '@/lib/tournament/leaderboard'
import { isCommunityFreeTournament } from '@/lib/tournament/community-free'

export const revalidate = 30 // refresca el leaderboard cada 30s

const PLACE_MEDAL = ['🥇', '🥈', '🥉']
const PRIZE_CENTS = [
  (t: Tournament) => t.prize_1st_cents,
  (t: Tournament) => t.prize_2nd_cents,
  (t: Tournament) => t.prize_3rd_cents,
]

const MODALITY_BADGE: Record<string, string> = {
  standard: '🏆',
  express:  '⚡',
  elite:    '💎',
  freeroll: '🎁',
}

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userId = user?.id ?? null

  const ranking = await loadTournamentLeaderboard(id)
  if (!ranking) notFound()
  const { tournament, rows, usernameMap } = ranking
  const community = isCommunityFreeTournament(tournament)
  const isCompleted = tournament.status === 'completed'
  const isLive = tournament.status === 'live'
  const isFinalizing = tournament.status === 'finalizing'
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{community ? '🏁' : MODALITY_BADGE[tournament.tournament_type] ?? '🏆'}</span>
            <h1 className="text-2xl font-bold">{community ? 'Clasificación del reto' : 'Ranking'}</h1>
            {isLive && (
              <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                EN VIVO
              </span>
            )}
            {isFinalizing && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                Finalizando…
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                ✓ Finalizado
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{tournament.name}</p>
        </div>
        <Link
          href={`/tournaments/${id}`}
          className="text-sm border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors whitespace-nowrap"
        >
          ← Volver
        </Link>
      </div>

      {/* Meta info */}
      {!isCompleted && (
        <p className="text-xs text-muted-foreground">
          Resultados actualizados cada 30 s · Cierre:{' '}
          {formatDateTimeCL(tournament.play_window_end)}
        </p>
      )}

      {isCompleted && !community && (
        <Link
          href={`/tournaments/${id}/audit`}
          className="inline-flex text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
        >
          Ver auditoría pública
        </Link>
      )}

      {/* Premios rápidos */}
      {!community && <div className="grid grid-cols-3 gap-2">
        {[
          { label: '🥇', amount: tournament.prize_1st_cents },
          { label: '🥈', amount: tournament.prize_2nd_cents },
          { label: '🥉', amount: tournament.prize_3rd_cents },
        ]
          .filter((p) => p.amount > 0)
          .map(({ label, amount }) => (
            <div key={label} className="border rounded-xl p-3 text-center">
              <p className="text-lg">{label}</p>
              <p className="text-sm font-semibold">{formatCLP(amount)}</p>
            </div>
          ))}
      </div>}
      {community && <p className="text-sm text-muted-foreground">Reto gratuito · un intento por cuenta · clasificación sin premios. {isCompleted ? 'Resultados oficiales.' : 'Clasificación provisional; puede cambiar hasta completar la revisión.'}</p>}

      {/* Tabla */}
      {rows.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-muted-foreground text-sm">
          {tournament.status === 'scheduled' || tournament.status === 'open'
            ? 'Las partidas aún no han comenzado.'
            : 'Nadie ha jugado aún.'}
        </div>
      ) : (
        <div className="border rounded-xl divide-y overflow-hidden">
          {/* Cabecera */}
          <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-x-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">Puntaje</span>
            {(!isCompleted || community) && <span className="text-right">Ficha máxima</span>}
            {isCompleted && !community && <span className="text-right">Premio</span>}
          </div>

          {rows.map((g, i) => {
            const place      = isCompleted ? (g.rank ?? i + 1) : i + 1
            const isMe       = g.user_id === userId
            const medal      = PLACE_MEDAL[place - 1] ?? ''
            const prizeAmt   = isCompleted
              ? (g.prize_awarded_cents ?? 0)
              : (PRIZE_CENTS[i] ? PRIZE_CENTS[i](tournament) : 0)

            return (
              <div
                key={g.user_id}
                className={`gap-x-3 px-4 py-3 items-center text-sm ${
                  isMe ? 'bg-amber-50' : place <= 3 ? 'bg-muted/20' : ''
                } grid grid-cols-[2rem_1fr_auto_auto]`}
              >
                {/* Posición */}
                <span className="font-mono text-muted-foreground text-base leading-none">
                  {medal || place}
                </span>

                {/* Nombre */}
                <span className={`font-medium truncate ${isMe ? 'text-amber-700' : ''}`}>
                  {usernameMap[g.user_id] ?? '—'}
                  {isMe && (
                    <span className="ml-1 text-xs text-muted-foreground">(tú)</span>
                  )}
                  {!isCompleted && g.status === 'active' && (
                    <span className="ml-1 text-xs text-green-600">● jugando</span>
                  )}
                </span>

                {/* Puntaje */}
                <span className="text-right font-mono font-semibold">
                  {Number(g.final_score).toLocaleString('es-CL')}
                </span>

                {/* Tile (solo live) */}
                {(!isCompleted || community) && (
                  <span className="text-right text-muted-foreground">
                    {g.highest_tile || '—'}
                  </span>
                )}

                {/* Premio (solo completado) */}
                {isCompleted && !community && (
                  <span
                    className={`text-right font-semibold ${
                      prizeAmt > 0 ? 'text-green-700' : 'text-muted-foreground'
                    }`}
                  >
                    {prizeAmt > 0 ? formatCLP(prizeAmt) : '—'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {community && <Link href="/play" className="block rounded-xl border p-4 text-center text-sm font-medium hover:bg-muted">Practicar y consultar el próximo reto</Link>}

      {/* Aviso competencia habilidad */}
      <p className="text-xs text-muted-foreground text-center">
        {community ? '2048 incorpora azar. El servidor calcula puntajes y desempates; esta clasificación no concede premios. ' : 'El ranking refleja los puntajes confirmados por el servidor. Los resultados son públicos y auditables. '}
        <Link href="/legal/terminos" className="underline underline-offset-2 hover:text-foreground">
          Términos y condiciones
        </Link>
      </p>
    </div>
  )
}
