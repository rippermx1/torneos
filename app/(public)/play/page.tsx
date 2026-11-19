import type { Metadata } from 'next'
import Link from 'next/link'
import { Unity2048 } from '@/components/game/unity-2048'
import { getTournamentReturnPath } from '@/lib/auth/redirect'

export const metadata: Metadata = {
  title: 'Práctica gratis — TorneosPlay',
  description: 'Juega 2048 gratis sin registro antes de entrar a torneos competitivos.',
}

export default async function PublicPlayPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = getTournamentReturnPath((await searchParams).next)
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">2048 · juega gratis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Partida libre sin inscripción, sin KYC y sin premios.
          </p>
        </div>
        <Link
          href={returnTo ?? '/tournaments'}
          className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          {returnTo ? 'Volver al torneo elegido' : 'Ver torneos'}
        </Link>
      </div>

      <Unity2048 />
    </div>
  )
}
