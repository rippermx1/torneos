import type { Metadata } from 'next'
import Link from 'next/link'
import { Unity2048 } from '@/components/game/unity-2048'
import { getTournamentReturnPath } from '@/lib/auth/redirect'
import { getUser } from '@/lib/supabase/auth'
import { getPublicTournaments } from '@/lib/tournament/public-catalog'
import { isCommunityFreePresetKey } from '@/lib/tournament/community-free'
import { CommunityChallengeBanner } from '@/components/tournament/community-challenge-banner'
import { get2048TicketOffer } from '@/lib/tournament/ticket-offer'
import { TicketOffer2048Banner } from '@/components/game/2048-ticket-offer-banner'

export const metadata: Metadata = {
  title: 'Práctica gratis — TorneosPlay',
  description: 'Practica 2048 gratis y supera el desafío diario: un nuevo tablero cada día de Chile.',
}

export default async function PublicPlayPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [params, user, catalog] = await Promise.all([searchParams, getUser(), getPublicTournaments()])
  const returnTo = getTournamentReturnPath(params.next)
  // Only server-managed QA accounts in the isolated development environment use
  // synthetic observations. Their real gameplay follows the same rules/UI.
  const qaRun = user?.app_metadata?.qa_2048_training_development?.runId
  const synthetic = process.env.TORNEOS_ENV === 'cloud-development' && typeof qaRun === 'string'
    && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(qaRun)
  const nextChallenge = catalog.tournaments.find(tournament => isCommunityFreePresetKey(tournament.preset_key) && Date.parse(tournament.play_window_end) > catalog.asOf) ?? null
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">2048 · juega gratis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practica a tu ritmo o vuelve cada día por un nuevo desafío. Gratis, sin premios y sin registro obligatorio.
          </p>
        </div>
        <Link
                href={returnTo ?? '/tournaments'}
          className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          {returnTo ? 'Volver al torneo elegido' : 'Ver torneos'}
        </Link>
      </div>

      <Unity2048 observationCategory={synthetic ? 'synthetic' : 'observed_browser'}
        measureAccountActivity={!!user && !user.is_anonymous && !synthetic} />
      <CommunityChallengeBanner tournament={nextChallenge} error={catalog.error} now={catalog.asOf} />
      <TicketOffer2048Banner offer={get2048TicketOffer('practice')} />
      {process.env.TORNEOS_ENV !== 'cloud-development' && <Link href="/play/ted-runner" className="block rounded-2xl border p-6 hover:bg-muted">
        <h2 className="text-lg font-semibold">Ted Runner</h2>
        <p className="mt-2 text-sm text-muted-foreground">Salta, recoge monedas y llega a la meta. Práctica gratuita, sin torneos ni premios.</p>
        <span className="mt-3 inline-block text-sm underline">Jugar Ted Runner</span>
      </Link>}
      <Link href="/play/factory-empire" className="block rounded-2xl border p-6 hover:bg-muted">
        <h2 className="text-lg font-semibold">Factory Empire</h2>
        <p className="mt-2 text-sm text-muted-foreground">Extrae ferrita, construye una industria y expande tu colonia 3D. Práctica gratuita, comunidad y desafío de 24 horas.</p>
        <span className="mt-3 inline-block text-sm underline">Abrir Factory Empire</span>
      </Link>
      {process.env.TORNEOS_ENV !== 'cloud-development' && <Link href="/play/snake-arena" className="block rounded-2xl border p-6 hover:bg-muted">
        <h2 className="text-lg font-semibold">SnakeArena · multiplayer</h2>
        <p className="mt-2 text-sm text-muted-foreground">Recoge luz, crece y compite por posición. Práctica gratuita en desarrollo, sin premios.</p>
        <span className="mt-3 inline-block text-sm underline">Abrir SnakeArena</span>
      </Link>}
    </div>
  )
}
