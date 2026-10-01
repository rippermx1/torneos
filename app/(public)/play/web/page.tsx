import Link from 'next/link'
import { GameBoard } from '@/components/game/game-board'
import { getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'

export const metadata = { title: '2048 · versión ligera — TorneosPlay' }
export default async function WebPractice({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = getTournamentReturnPath((await searchParams).next)
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">2048 · versión ligera</h1>
      <p className="text-sm text-muted-foreground">Práctica gratuita, sin inscripción ni premios.</p>
      <div className="flex flex-wrap gap-4">
        {returnTo && <Link className="text-sm font-medium underline" href={returnTo}>Volver al torneo elegido</Link>}
        <Link className="text-sm underline" href={returnTo ? withAuthDestination('/play', returnTo) : '/play'}>Volver a juegos</Link>
      </div>
      <GameBoard />
    </div>
  )
}
