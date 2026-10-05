import Link from 'next/link'
import {UnityAlienRun} from '@/components/game/unity-alien-run'
import { providerDispatchBlocked } from '@/lib/config/provider-dispatch.mjs'
export const metadata={title:'Alien Run — TorneosPlay',description:'Practica gratis en un plataformas de habilidad con monedas, estrellas y obstáculos.'}
export default function AlienRunPage(){return <div className="mx-auto max-w-6xl space-y-6 px-4 py-8"><div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Alien Run</h1><p className="text-sm text-muted-foreground">Salta, explora y llega a la meta.</p></div><Link className="text-sm underline" href="/play">Juegos</Link></div>{providerDispatchBlocked() ? <p>Este juego no está disponible en el ensayo RM-12. Puedes probar 2048 desde Juegos.</p> : <UnityAlienRun />}</div>}
