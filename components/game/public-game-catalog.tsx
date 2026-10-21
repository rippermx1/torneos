import Link from 'next/link'
import { getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'
import { FREE_2048_RELEASE } from '@/lib/release/free-2048'
import styles from './public-game-catalog.module.css'

export function PublicGameCatalog({ next }: { next?: unknown }) {
  const returnTo = getTournamentReturnPath(next)
  const practice = (path: string) => returnTo ? withAuthDestination(path, returnTo) : path
  return <div className={styles.catalog} data-release-profile={FREE_2048_RELEASE.profile}>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>TorneosPlay · 2048</p>
      <h1>2048 gratis y un desafío cada día</h1>
      <p>Juega a tu ritmo y vuelve por un nuevo tablero cada día de Chile.</p>
    </header>
    <div className={styles.cards}>
      <article className={styles.card} aria-labelledby="catalog-2048">
        <div className={`${styles.art} ${styles.numbers}`} aria-hidden="true"><span>2</span><span>4</span><span>8</span><span>16</span></div>
        <div className={styles.content}>
          <p className={styles.mode}>Práctica gratis · Desafío diario</p>
          <h2 id="catalog-2048">2048</h2>
          <p>Une números iguales, suma puntos y encuentra espacio para la siguiente ficha.</p>
          <p className={styles.controls}><strong>Controles:</strong> flechas o WASD. En teléfono, desliza sobre el tablero.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={practice('/play')} prefetch={false}>Jugar práctica y desafío diario</Link>
            <Link href="/play/2048/ticket">Consultar ticket informativo</Link>
            {returnTo ? <Link href={returnTo}>Volver al torneo elegido</Link> : null}
          </div>
          <p className={styles.note}>La práctica y el desafío diario no requieren cuenta ni entregan premios. Desde el tablero puedes elegir el desafío de hoy.</p>
          <p className={styles.note}>El entrenamiento asistido es una demostración y no cuenta para récord ni clasificación. El ticket es informativo y todavía no se puede comprar.</p>
        </div>
      </article>
    </div>
  </div>
}
