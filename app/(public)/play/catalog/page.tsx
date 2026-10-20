import type { Metadata } from 'next'
import { PublicGameCatalog } from '@/components/game/public-game-catalog'

export const metadata: Metadata = {
  title: 'Juegos y práctica gratis — TorneosPlay',
  description: 'Explora 2048, Factory Empire 3D, Snake Arena y Ted Runner. Conoce sus controles y modalidades disponibles.',
}

export default async function GameCatalogPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const localGamesAvailable = process.env.TORNEOS_ENV !== 'cloud-development'
  return <PublicGameCatalog next={(await searchParams).next} tedAvailable={localGamesAvailable} snakeAvailable={localGamesAvailable} />
}
