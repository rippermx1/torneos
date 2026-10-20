import Link from 'next/link'
import type { Metadata } from 'next'
import { getPublicTournaments } from '@/lib/tournament/public-catalog'
import { TournamentCard } from '@/components/tournament/tournament-card'
import { CatalogFeedback } from '@/components/tournament/catalog-feedback'
import { SnakeCatalog } from '@/components/tournament/snake-catalog'

export const metadata: Metadata = {
  title: 'Torneos — TorneosPlay',
  description: 'Explora torneos de 2048 y rondas gratuitas de Snake Arena con reglas y resultados publicados.',
}

export default async function TournamentsPage() {
  const { tournaments, error, asOf } = await getPublicTournaments()
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Elige tu torneo</h1>
          <p className="mt-2 text-sm text-muted-foreground">Consulta los retos comunitarios gratuitos y los demás formatos. Cada actividad publica sus horarios, reglas y resultados.</p>
        </div>
        <Link href="/play" className="shrink-0 text-sm font-medium underline underline-offset-4">Explorar juegos y practicar</Link>
      </div>
      <SnakeCatalog />
      <h2 className="text-2xl font-bold">2048</h2>
      <p className="text-xs text-muted-foreground">Horarios de Chile (Santiago). Los cupos se confirman al inscribirte.</p>
      {error || tournaments.length === 0 ? <CatalogFeedback error={error} /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tournaments.map((t) => <TournamentCard key={t.id} tournament={t} now={asOf} />)}
        </div>
      )}
    </div>
  )
}
