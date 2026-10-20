'use client'
import Link from 'next/link'
import {useEffect,useSyncExternalStore} from 'react'
import {trackSnakeFunnel,canBrowseSnakeTournaments} from '@/lib/analytics/snake-funnel-client'
import type {FunnelEvent} from '@/lib/analytics/snake-funnel'
const subscribe=()=>()=>{}
export function SnakeFunnelObserver({event,availability}:{event:FunnelEvent['event'];availability?:FunnelEvent['availability']}){
  useEffect(()=>{trackSnakeFunnel({event,...(availability?{availability}:{})})},[event,availability]);return null
}
export function SnakeTournamentLink({surface='header',className,children}:{surface?:'header'|'result';className?:string;children:React.ReactNode}){
  const available=useSyncExternalStore(subscribe,canBrowseSnakeTournaments,()=>true)
  if(!available)return <p className="text-sm text-muted-foreground">Los torneos todavía no están disponibles en esta vista de práctica.</p>
  return <Link href="/tournaments" className={className} onClick={()=>trackSnakeFunnel({event:'tournaments_click',surface})}>{children}</Link>
}
export function SnakeTournamentInvitation(){
  const available=useSyncExternalStore(subscribe,canBrowseSnakeTournaments,()=>true);if(!available)return null
  return <aside aria-label="Tu próxima competición" className="flex flex-col gap-4 rounded-2xl border border-teal-400/25 bg-gradient-to-br from-[#10333a] to-[#08121e] p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div className="space-y-1"><p className="text-xs font-semibold uppercase tracking-widest text-teal-200">Juega con un inicio común</p><h2 className="text-xl font-semibold">Lleva tu práctica a un torneo</h2><p className="max-w-xl text-sm text-teal-100/80">Consulta horarios, reglas y cupos de Snake Arena. Inscripción gratuita, una vida por ronda y clasificación al terminar.</p></div><SnakeTournamentLink surface="result" className="shrink-0 rounded-xl bg-teal-300 px-5 py-3 text-center text-sm font-semibold text-[#07101a] hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">Ver torneos gratuitos →</SnakeTournamentLink></aside>
}
