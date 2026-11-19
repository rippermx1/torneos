import type { Metadata } from 'next'
import { PublicGameCatalog } from '@/components/game/public-game-catalog'

export const metadata: Metadata = {
  title: 'Juegos y práctica gratis — TorneosPlay',
  description: 'Juega 2048 gratis y conoce sus controles y modalidades disponibles.',
}

export default async function GameCatalogPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <PublicGameCatalog next={(await searchParams).next} />
}
