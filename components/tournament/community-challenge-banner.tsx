import Link from 'next/link'
import type { PublicTournament } from '@/lib/tournament/availability'
import { getTournamentAvailability } from '@/lib/tournament/availability'
import { formatDateTimeCL } from '@/lib/utils'

export function CommunityChallengeBanner({ tournament, error = false, now }: {
  tournament: PublicTournament | null; error?: boolean; now: number
}) {
  const availability = tournament ? getTournamentAvailability(tournament, now) : null
  return <section className="rounded-2xl border bg-muted/20 p-5 space-y-3" aria-labelledby="community-challenge-heading">
    <h2 id="community-challenge-heading" className="text-lg font-semibold">
      {availability?.kind === 'live' ? 'Reto comunitario en curso' : 'Próximo reto comunitario de 2048'}
    </h2>
    {error ? <p className="text-sm text-muted-foreground">No pudimos confirmar la próxima fecha. Puedes seguir practicando y consultar los retos.</p>
      : tournament ? <>
        <p className="font-medium">{tournament.name}</p>
        <p className="text-sm text-muted-foreground">Gratis · un intento por cuenta · cinco minutos · clasificación sin premios.</p>
        <p className="text-sm">Inscripción hasta {formatDateTimeCL(tournament.play_window_start)} · Juego: {formatDateTimeCL(tournament.play_window_start)} — {formatDateTimeCL(tournament.play_window_end)} (Chile).</p>
        <p className="text-sm text-muted-foreground">{availability?.label}. La práctica libre y el desafío diario conservan sus propias marcas.</p>
      </> : <p className="text-sm text-muted-foreground">La próxima fecha todavía no está programada. Mientras tanto, puedes practicar o jugar el desafío diario.</p>}
    <Link href={tournament ? `/tournaments/${tournament.id}` : '/tournaments'} className="inline-flex text-sm font-medium underline underline-offset-4">
      {tournament ? 'Ver reglas, inscripción y clasificación' : 'Consultar retos y torneos'}
    </Link>
  </section>
}
