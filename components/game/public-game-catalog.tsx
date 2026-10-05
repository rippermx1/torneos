import Link from 'next/link'
import { getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'
import styles from './public-game-catalog.module.css'

export function PublicGameCatalog({ next, tedAvailable }: { next?: unknown; tedAvailable: boolean }) {
  const returnTo = getTournamentReturnPath(next)
  const practice = (path: string) => returnTo ? withAuthDestination(path, returnTo) : path
  return <div className={styles.catalog}>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>TorneosPlay · Juegos</p>
      <h1>Elige cómo jugar</h1>
      <p>Practica gratis y conoce los controles antes de participar en un torneo.</p>
    </header>
    <div className={styles.cards}>
      <article className={styles.card} aria-labelledby="catalog-2048">
        <div className={`${styles.art} ${styles.numbers}`} aria-hidden="true"><span>2</span><span>4</span><span>8</span><span>16</span></div>
        <div className={styles.content}>
          <p className={styles.mode}>Práctica gratis · Torneos</p>
          <h2 id="catalog-2048">2048</h2>
          <p>Une números iguales, suma puntos y encuentra espacio para la siguiente ficha.</p>
          <p className={styles.controls}><strong>Controles:</strong> flechas o WASD. En teléfono, desliza sobre el tablero.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={practice('/play')} prefetch={false}>Practicar 2048</Link>
            <Link href={returnTo ?? '/tournaments'}>{returnTo ? 'Volver al torneo elegido' : 'Ver torneos de 2048'}</Link>
          </div>
          <p className={styles.note}>La práctica no requiere cuenta ni entrega premios. Para competir, revisa las reglas, requisitos y premios de cada torneo.</p>
        </div>
      </article>
      <article className={styles.card} aria-labelledby="catalog-ted">
        <div className={`${styles.art} ${styles.runner}`} aria-hidden="true"><span>↗</span><span>●</span><span>★</span></div>
        <div className={styles.content}>
          <p className={styles.mode}>Práctica gratis</p>
          <h2 id="catalog-ted">Ted Runner</h2>
          <p>Salta entre plataformas, recoge monedas y estrellas y llega a la meta.</p>
          <p className={styles.controls}><strong>Controles:</strong> A/D o flechas para avanzar; Espacio para saltar. En teléfono, usa los controles de pantalla.</p>
          <div className={styles.actions}>
            {tedAvailable ? <Link className={styles.primary} href={practice('/play/alien-run')} prefetch={false}>Practicar Ted Runner</Link> : <p className={styles.unavailable}>Aún no disponible en este ambiente.</p>}
          </div>
          <p className={styles.note}>Práctica sin inscripción, torneos ni premios.</p>
        </div>
      </article>
    </div>
  </div>
}
