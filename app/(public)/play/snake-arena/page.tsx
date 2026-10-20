import type {Metadata} from 'next'
import Link from 'next/link'
import {UnitySnakeArena} from '@/components/game/unity-snake-arena'
import {SnakeFunnelObserver,SnakeTournamentLink} from '@/components/game/snake-funnel'
export const metadata:Metadata={title:'SnakeArena · práctica multiplayer — TorneosPlay',description:'Arena gratuita: recolecta, crece y compite por posición con otros jugadores.'}
export default function SnakeArenaPage(){
  if(process.env.TORNEOS_ENV==='cloud-development')return <div className="mx-auto max-w-3xl space-y-4 px-4 py-8"><h1 className="text-2xl font-bold">SnakeArena</h1><p>Las salas multiplayer aún no están disponibles en el ambiente de desarrollo.</p><Link className="underline" href="/play">Volver a juegos</Link></div>
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-8"><SnakeFunnelObserver event="practice_view"/><div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">SnakeArena</h1><p className="mt-1 text-sm text-muted-foreground">Práctica multiplayer gratuita en desarrollo · sin premios.</p></div><Link href="/play" className="text-sm underline">Volver a juegos</Link></div><SnakeTournamentLink className="inline-block rounded-lg border px-4 py-3 text-sm font-semibold">Ver torneos gratuitos de Snake Arena</SnakeTournamentLink><UnitySnakeArena/></div>
}
