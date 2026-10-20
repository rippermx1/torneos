import Link from 'next/link'
import { getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'
import styles from './public-game-catalog.module.css'

export function PublicGameCatalog({ next, tedAvailable, snakeAvailable = true }: { next?: unknown; tedAvailable: boolean; snakeAvailable?: boolean }) {
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
      <article className={styles.card} aria-labelledby="catalog-factory">
        <div className={`${styles.art} ${styles.numbers}`} aria-hidden="true"><span>⚙</span><span>↗</span><span>✦</span></div>
        <div className={styles.content}>
          <p className={styles.mode}>Práctica gratis · Colonia y comunidad</p>
          <h2 id="catalog-factory">Factory Empire 3D</h2>
          <p>Extrae ferrita, construye máquinas y expande tu colonia minera.</p>
          <p className={styles.controls}><strong>Controles:</strong> botón derecho para girar la cámara y rueda para acercarte. En teléfono, arrastra para desplazar y usa dos dedos para girar y acercarte.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={practice('/play/factory-empire')} prefetch={false}>Jugar Factory Empire</Link>
            <Link href="/play/factory-empire/community">Visitar colonias</Link>
            <Link href="/play/factory-empire/challenge">Desafío de 24 horas</Link>
          </div>
          <p className={styles.note}>Juega localmente o guarda una colonia separada con tu cuenta. El desafío comienza desde las mismas condiciones para todos, sin premios.</p>
        </div>
      </article>
      <article className={styles.card} aria-labelledby="catalog-snake">
        <div className={`${styles.art} ${styles.runner}`} aria-hidden="true"><span>●</span><span>●</span><span>●</span></div>
        <div className={styles.content}>
          <p className={styles.mode}>Práctica gratis · Multijugador</p>
          <h2 id="catalog-snake">Snake Arena</h2>
          <p>Recoge orbes, crece y sobrevive en una arena compartida.</p>
          <p className={styles.controls}><strong>Controles:</strong> apunta con el ratón o el control táctil; mantén el impulso para acelerar.</p>
          <div className={styles.actions}>
            {snakeAvailable ? <Link className={styles.primary} href={practice('/play/snake-arena')} prefetch={false}>Jugar Snake Arena</Link> : <p className={styles.unavailable}>Las salas multijugador aún no están disponibles en este ambiente.</p>}
          </div>
          <p className={styles.note}>Práctica gratuita sin premios.</p>
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
