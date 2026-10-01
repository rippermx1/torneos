import type { Metadata } from 'next'
import Link from 'next/link'
import { Unity2048 } from '@/components/game/unity-2048'

export const metadata: Metadata = {
  title: 'Práctica gratis — TorneosPlay',
  description: 'Juega 2048 gratis sin registro antes de entrar a torneos competitivos.',
}

export default function PublicPlayPage() {
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
          href="/tournaments"
          className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Ver torneos
        </Link>
      </div>

      <Unity2048 />
      <p className="text-sm text-muted-foreground">¿Tu dispositivo necesita una carga más rápida? <Link href="/play/web" className="underline">Abrir versión ligera</Link></p>
      <Link href="/play/alien-run" className="block rounded-2xl border p-6 hover:bg-muted">
        <h2 className="text-lg font-semibold">Alien Run</h2>
        <p className="mt-2 text-sm text-muted-foreground">Salta, recoge monedas y llega a la meta. Prueba gratis nuestro plataformas de habilidad.</p>
        <span className="mt-3 inline-block text-sm underline">Jugar Alien Run</span>
      </Link>
    </div>
  )
}
