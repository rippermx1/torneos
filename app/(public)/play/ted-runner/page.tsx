import Link from 'next/link'
import {UnityTedRunner} from '@/components/game/unity-ted-runner'
export const metadata={title:'Ted Runner — TorneosPlay',description:'Juega Ted Runner gratis: salta, recoge monedas y estrellas y supera obstáculos.'}
export default function TedRunnerPage(){
  if(process.env.TORNEOS_ENV==='cloud-development')return <div className="mx-auto max-w-3xl space-y-4 px-4 py-8"><h1 className="text-2xl font-bold">Ted Runner</h1><p>Este juego aún no está disponible en el ambiente de desarrollo.</p><Link className="underline" href="/play">Volver a juegos</Link></div>
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-8"><div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Ted Runner</h1><p className="text-sm text-muted-foreground">Salta, explora y llega a la meta.</p></div><Link className="text-sm underline" href="/play">Juegos</Link></div><UnityTedRunner /></div>
}
