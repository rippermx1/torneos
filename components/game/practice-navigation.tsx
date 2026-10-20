'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'
import styles from './public-game-catalog.module.css'

export function PracticeNavigation() {
  const params = useSearchParams().getAll('next')
  const returnTo = getTournamentReturnPath(params.length === 1 ? params[0] : null)
  return <nav className={styles.navigation} aria-label="Navegación de práctica">
    <Link href={returnTo ? withAuthDestination('/play/catalog', returnTo) : '/play/catalog'}>Explorar juegos</Link>
    {returnTo && <Link href={returnTo}>Torneo seleccionado</Link>}
  </nav>
}
