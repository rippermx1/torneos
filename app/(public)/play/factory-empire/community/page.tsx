import type {Metadata} from 'next'
import Link from 'next/link'
import {FactoryCommunity} from '@/components/game/factory-community'
import styles from '@/components/game/factory-community.module.css'
export const metadata:Metadata={title:'Comunidad Factory Empire — TorneosPlay',description:'Visita colonias publicadas y compara su producción e historia confirmadas.'}
export default function CommunityPage(){return <div className={`mx-auto max-w-7xl px-3 py-6 sm:px-6 ${styles.page} ${styles.surface}`}><header className={styles.intro}><span className={styles.eyebrow}>FACTORY EMPIRE · NEREIDA</span><h1>Una galaxia de industrias</h1><p>Descubre cómo crecen otras colonias. Compara su producción, explora sus máquinas y comparte tu propio avance cuando quieras.</p><nav className={styles.nav} aria-label="Factory Empire"><Link className={styles.link} href="/play/factory-empire">Volver a mi colonia</Link><Link className={styles.link} href="/play/factory-empire/challenge">Desafío · 24 horas</Link><Link className={styles.link} href="/play">Todos los juegos</Link></nav></header><FactoryCommunity/></div>}
