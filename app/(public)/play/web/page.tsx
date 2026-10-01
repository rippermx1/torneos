import Link from 'next/link'
import {GameBoard} from '@/components/game/game-board'
export const metadata={title:'2048 · versión ligera — TorneosPlay'}
export default function WebPractice(){return <div className="mx-auto max-w-3xl space-y-6 px-4 py-8"><h1 className="text-2xl font-bold">2048 · versión ligera</h1><p className="text-sm text-muted-foreground">Práctica gratuita, sin inscripción ni premios.</p><Link className="text-sm underline" href="/play">Volver a juegos</Link><GameBoard /></div>}
