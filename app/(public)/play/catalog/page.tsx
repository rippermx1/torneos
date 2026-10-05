import type { Metadata } from 'next'
import { PublicGameCatalog } from '@/components/game/public-game-catalog'

export const metadata: Metadata = {
  title: 'Juegos y práctica gratis — TorneosPlay',
  description: 'Conoce los controles y modalidades de 2048 y Ted Runner. Practica gratis y consulta los torneos de 2048.',
}

export default async function GameCatalogPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <PublicGameCatalog next={(await searchParams).next} tedAvailable={process.env.TORNEOS_ENV !== 'cloud-development'} />
}
