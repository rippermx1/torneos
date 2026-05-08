import type { Metadata } from 'next'
import Link from 'next/link'
import { GameBoard } from '@/components/game/game-board'

export const metadata: Metadata = {
  title: 'Práctica gratis — TorneosPlay',
  description: 'Juega 2048 gratis sin registro antes de entrar a torneos competitivos.',
}

export default function PublicPlayPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Práctica gratis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Partida libre sin inscripción, sin KYC y sin premios.
          </p>
        </div>
        <Link
          href="/tournaments"
          className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Ver torneos
        </Link>
      </div>

      <GameBoard />
    </div>
  )
}
