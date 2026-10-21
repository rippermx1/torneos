import type { Metadata } from 'next'
import { PublicGameCatalog } from '@/components/game/public-game-catalog'

export const metadata: Metadata = {
  title: '2048 gratis y desafío diario — TorneosPlay',
  description: 'Conoce los controles de 2048, practica gratis y vuelve por el desafío diario. El ticket es sólo informativo y no está disponible para compra.',
}

export default async function GameCatalogPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <PublicGameCatalog next={(await searchParams).next} />
}
