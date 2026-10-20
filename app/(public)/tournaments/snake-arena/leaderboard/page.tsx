import Link from 'next/link'
import type {Metadata} from 'next'
import {SnakeCompetitiveLeaderboard} from '@/components/tournament/snake-competitive-leaderboard'
export const metadata:Metadata={title:'Clasificación competitiva de Snake Arena — TorneosPlay',description:'Puntos acumulados por posición en torneos gratuitos de Snake Arena.'}
export default function Page(){
  return <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <Link href="/tournaments" className="text-sm underline underline-offset-4">← Ver torneos</Link>
    <div><p className="text-sm font-semibold text-teal-700">Snake Arena · Torneos gratuitos</p><h1 className="mt-2 text-3xl font-bold">Clasificación competitiva</h1><p className="mt-3 text-sm text-muted-foreground">Cada torneo terminado suma puntos según tu posición. Publica tu participación y compite por subir en la clasificación histórica.</p></div>
    <SnakeCompetitiveLeaderboard/>
    <details open className="rounded-xl border p-5"><summary className="font-semibold">Cómo se suman los puntos</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
      <li>Primero: 100 puntos. Último: 0. Las posiciones intermedias reciben puntos proporcionales al total de inscritos, redondeados al entero más cercano. En una ronda de cuatro: 100, 67, 33 y 0.</li>
      <li>Los puntos se acumulan en todos tus torneos gratuitos terminados, también antes de publicar tu participación. Las victorias desempatan; si persiste el empate, se comparte posición.</li>
      <li>Las ausencias dan 0 puntos y no cuentan como torneo jugado ni victoria. Las rondas canceladas o en curso no suman.</li>
      <li>Publicar u ocultar esta clasificación es una elección independiente de práctica. Los resultados individuales de los torneos siguen siendo públicos.</li>
    </ul><p className="mt-4 text-xs text-muted-foreground">Reglas de clasificación snake-league-v1 · Sin inscripción de pago ni premios monetarios.</p></details>
    <Link href="/play/snake-arena" className="inline-block text-sm underline underline-offset-4">Practicar antes del próximo torneo</Link>
  </div>
}
