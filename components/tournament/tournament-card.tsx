import Link from 'next/link'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import { getTournamentAvailability, type PublicTournament, type TournamentAvailability } from '@/lib/tournament/availability'
import { isCommunityFreePresetKey } from '@/lib/tournament/community-free'

export function AvailabilityBadge({ availability }: { availability: TournamentAvailability }) {
  const color = availability.kind === 'open' ? 'bg-green-100 text-green-800'
    : availability.kind === 'live' ? 'bg-amber-100 text-amber-800'
    : 'bg-muted text-muted-foreground'
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{availability.label}</span>
}

export function TournamentCard({ tournament: t, now }: { tournament: PublicTournament; now: number }) {
  const availability = getTournamentAvailability(t, now)
  const community = isCommunityFreePresetKey(t.preset_key)
  const totalPrize = t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
  return (
    <Link href={`/tournaments/${t.id}`} className="flex h-full flex-col gap-4 rounded-2xl border bg-background p-5 transition-colors hover:border-foreground/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{community ? '2048 · reto comunitario' : '2048'}</span>
          <AvailabilityBadge availability={availability} />
        </div>
        <h2 className="text-lg font-semibold leading-tight break-words">{t.name}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3">
        <div><p className="text-xs text-muted-foreground">Inscripción · precio final</p><p className="font-semibold">{t.entry_fee_cents === 0 ? 'Gratis' : formatCLP(t.entry_fee_cents)}</p></div>
        {community ? <div><p className="text-xs text-muted-foreground">Modalidad</p><p className="font-semibold">Clasificación sin premios</p></div>
          : <div><p className="text-xs text-muted-foreground">Premio total fijo</p><p className="font-semibold">{formatCLP(totalPrize)}</p></div>}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Inscripciones desde: {formatDateTimeCL(t.registration_opens_at)}</p>
        <p>Inscripción hasta: {formatDateTimeCL(t.play_window_start)}</p>
        <p>Partidas: {formatDateTimeCL(t.play_window_start)} — {formatDateTimeCL(t.play_window_end)}</p>
        <p>{community ? 'Un intento por cuenta' : 'Una partida'} · {community ? '' : 'hasta '}{t.max_game_duration_seconds / 60} min</p>
        {community && <p>Último inicio: {formatDateTimeCL(new Date(Date.parse(t.play_window_end) - t.max_game_duration_seconds * 1000))}</p>}
        <p>{availability.slots === null ? 'Cupos por confirmar'
          : ['live', 'closed', 'completed', 'cancelled'].includes(availability.kind) ? `${t.registeredCount} / ${t.max_players} inscritos`
          : `${availability.slots} cupos libres · ${t.registeredCount} / ${t.max_players} inscritos`}</p>
        <p>Mínimo para jugar: {t.min_players} participantes</p>
      </div>
      <span className="mt-auto text-sm font-semibold underline underline-offset-4">
        {community ? 'Ver reto, reglas y clasificación' : availability.kind === 'live' || availability.kind === 'closed' ? 'Ver torneo y ranking' : 'Ver reglas y premios'} →
      </span>
    </Link>
  )
}
