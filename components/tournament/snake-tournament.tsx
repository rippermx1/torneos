'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {SNAKE_CHANNEL} from '@/lib/game/snake-arena-client'
import {readCompetitionMessage} from '@/lib/snake-arena/competition-client'
import type {SnakeTournament,SnakeResult} from '@/lib/snake-arena/types'
import {trackSnakeFunnel} from '@/lib/analytics/snake-funnel-client'
type Detail={tournament:SnakeTournament;results:SnakeResult[];participants:number;registered:boolean;authenticated:boolean;serverNow:number}
const reasons:Record<string,string>={wall:'Borde',body:'Colisión con cuerpo',head:'Colisión frontal',timeout:'Tiempo cumplido',disconnect:'Desconexión',no_show:'Ausente al inicio'}
export function SnakeTournament({id}:{id:string}){
  const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false)
  const [remaining,setRemaining]=useState(0),[score,setScore]=useState(0),[alive,setAlive]=useState(true),[round,setRound]=useState(''),[leaders,setLeaders]=useState<{id:string;name:string;score:number;rank:number}[]>([])
  const [mass,setMass]=useState(0),[boostHeld,setBoostHeld]=useState(false)
  const held=useRef(false)
  useEffect(()=>{if(detail?.tournament.id===id)trackSnakeFunnel({event:'tournament_view'})},[id,detail?.tournament.id])
  const frame=useRef<HTMLIFrameElement>(null),player=useRef(''),clock=useRef({server:0,at:0,target:0})
  const boost=useCallback((value:boolean)=>{held.current=value;setBoostHeld(value);frame.current?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'boost',held:value},location.origin)},[])
  useEffect(()=>{const release=()=>boost(false);const visibility=()=>{if(document.hidden)release()};window.addEventListener('blur',release);document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',visibility)}},[boost])
  useEffect(()=>{
    let active=true
    const refresh=async()=>{try{const r=await fetch(`/api/snake-arena/tournaments/${id}`,{cache:'no-store'}),d=await r.json();if(!active)return;if(!r.ok){setError(d.error);return}setDetail(d);clock.current={server:d.serverNow,at:performance.now(),target:Date.parse(d.tournament.starts_at)+(['live','completed'].includes(d.tournament.status)?d.tournament.duration_seconds*1000:0)}}catch{if(active)setError('No se pudo actualizar el torneo. Reintentando…')}}
    void refresh();const poll=setInterval(()=>void refresh(),2000),timer=setInterval(()=>setRemaining(Math.max(0,Math.ceil((clock.current.target-clock.current.server-(performance.now()-clock.current.at))/1000))),250)
    return()=>{active=false;clearInterval(poll);clearInterval(timer)}
  },[id])
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return
      const data=readCompetitionMessage(event.data);if(!data)return
      if(data.type==='ready')setReady(true)
      if(data.type==='welcome'){player.current=data.id??'';setConnected(true);setError('')}
      if(data.type==='snapshot'){
        const me=data.players?.find(p=>p.id===player.current);if(me){setScore(me.score);setAlive(me.alive);setMass(me.mass);if(held.current&&(!me.alive||me.mass<=8))boost(false)}setLeaders(data.leaderboard??[])
        const competition=(event.data.data as {competition?:{state:string;serverNow:number;startsAt:number;endsAt:number}}).competition
        if(competition){setRound(competition.state);clock.current={server:competition.serverNow,at:performance.now(),target:competition.state==='countdown'?competition.startsAt:competition.endsAt}}
      }
      if(data.type==='disconnect'){setConnected(false);boost(false)}
      if(data.type==='error')setError(data.code==='admission_denied'?'La sala aún no está lista, ya tienes una conexión o tu acceso expiró. Vuelve a conectar.':`No se pudo conectar (${data.code??'carga'}).`)
    }
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)
  },[boost])
  async function action(type:'register'|'ticket'){
    setBusy(true);setError('')
    try{
      const response=await fetch(`/api/snake-arena/tournaments/${id}/${type}`,{method:'POST'}),value=await response.json()
      if(!response.ok){setError(value.error);return}
      if(type==='register')setDetail(d=>d?{...d,registered:true,participants:d.participants+1}:d)
      else{frame.current?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'join',ticket:value.ticket},location.origin);frame.current?.focus()}
    }catch{setError('No se pudo confirmar la acción. Reintenta para recuperar su estado.')}
    finally{setBusy(false)}
  }
  if(!detail)return <div className="mx-auto max-w-5xl px-4 py-10"><p role="status">{error||'Cargando torneo…'}</p></div>
  const t=detail.tournament,finished=['completed','cancelled'].includes(t.status),canRegister=t.status==='open'&&detail.serverNow<Date.parse(t.starts_at)-30000
  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
    <Link href="/tournaments" className="text-sm underline">Todos los torneos</Link>
    <header className="space-y-3"><p className="text-sm font-semibold text-teal-600">Snake Arena · Torneo gratuito · Sin premios monetarios</p><h1 className="text-3xl font-bold">{t.name}</h1><p>{new Date(t.starts_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})} (Chile) · {t.duration_seconds} segundos · {detail.participants}/{t.max_players} inscritos</p></header>
    <div className="rounded-xl border p-5"><p className="font-semibold" role="status">{t.status==='completed'?'Clasificación definitiva':t.status==='cancelled'?'Torneo cancelado':t.status==='open'?`Inscripciones abiertas · Inicio en ${remaining} s`:round==='finalizing'?'Guardando resultados…':t.status==='locked'?`Sala abierta · Inicio en ${remaining} s`:`Ronda en curso · ${remaining} s restantes`}</p>
      {t.status==='cancelled'&&<p className="mt-2">{t.cancel_reason==='insufficient_players'?'Se necesitan al menos dos inscritos.':'La ronda se interrumpió o el servidor no estuvo disponible. No hay resultados competitivos válidos.'}</p>}
      {!finished&&!detail.registered&&(detail.authenticated?<button disabled={!canRegister||busy||detail.participants>=t.max_players} onClick={()=>void action('register')} className="mt-4 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{canRegister?'Inscribirme gratis':'Inscripción cerrada'}</button>:<Link href={`/sign-in?next=${encodeURIComponent(`/tournaments/snake-arena/${id}`)}`} className="mt-4 inline-block rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white">Ingresar para inscribirme</Link>)}
      {detail.registered&&!finished&&<p className="mt-2">{connected?'Tu inscripción está confirmada. Conservas una sola vida durante esta ronda.':'Tu inscripción está confirmada. Carga el juego y entra en la sala antes del inicio.'}</p>}
    </div>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {detail.registered&&!finished&&<section className="space-y-3" aria-label="Arena competitiva">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#10333a] p-4 text-white"><p>Puntaje <strong className="text-2xl tabular-nums">{score}</strong> · {connected?(round==='countdown'?'Esperando el inicio':alive?'Una vida en juego':'Eliminado · espera la clasificación'):'Sin conexión'}</p><button disabled={!ready||connected||busy||!['locked','live'].includes(t.status)} onClick={()=>void action('ticket')} className="rounded-lg bg-teal-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">{!ready?'Cargando Unity…':connected?'En la sala':'Conectar con mi inscripción'}</button></div>
      <iframe ref={frame} src="/games/snake-arena/competition/index.html" title="Snake Arena — torneo gratuito" sandbox="allow-scripts allow-same-origin" className="h-[min(65dvh,600px)] min-h-80 w-full rounded-xl border bg-[#07101a]"/>
      <div className="flex flex-wrap items-center gap-3"><button type="button" aria-label="Mantener boost: consume masa" aria-pressed={boostHeld} disabled={!connected||!alive||round!=='live'||mass<=8}
        onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);boost(true)}} onPointerUp={()=>boost(false)} onPointerCancel={()=>boost(false)} onLostPointerCapture={()=>boost(false)} onBlur={()=>boost(false)}
        onKeyDown={event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();boost(true)}}} onKeyUp={event=>{if(event.code==='Space'||event.code==='Enter')boost(false)}}
        className="touch-none rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-40 aria-pressed:bg-teal-500">Boost</button><p className="text-sm">Masa {mass} · Mantén para acelerar. Consume 2 masa/s; mínimo 8.</p></div>
      {leaders.length>0&&<p className="text-sm">Ranking provisional: {leaders.slice(0,5).map(p=>`${p.rank}. ${p.name} (${p.score})`).join(' · ')}</p>}
      <p className="text-sm text-muted-foreground">Dirige con el mouse o arrastra con el dedo. Mantén clic izquierdo o Boost para acelerar consumiendo masa. Una vida; puedes reconectar durante 10 segundos y conservas tu posición, puntaje y estado.</p>
    </section>}
    {t.status==='completed'&&<section className="overflow-x-auto"><h2 className="mb-3 text-xl font-bold">Resultados guardados por el servidor</h2><table className="w-full text-left text-sm [&_th]:px-3 [&_th]:py-3 [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-3"><thead><tr><th scope="col">Posición</th><th scope="col">Jugador</th><th scope="col">Puntos</th><th scope="col">Tiempo</th><th scope="col">Eliminaciones</th><th scope="col">Fin de vida</th></tr></thead><tbody>{detail.results.map(r=><tr key={r.user_id} className="border-t"><td className="font-semibold">{r.rank}</td><td>{r.display_name}</td><td>{r.score}</td><td>{(r.survived_ms/1000).toFixed(1)} s</td><td>{r.kills}</td><td>{reasons[r.reason]??r.reason}</td></tr>)}</tbody></table></section>}
    <details open className="rounded-xl border p-5"><summary className="font-semibold">Reglas publicadas · {t.rules_version}</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm"><li>Una sala privada, de 2 a 16 inscritos. La inscripción cierra 30 segundos antes del inicio. Sin bots y sin reinicios.</li><li>Inicio simultáneo. Quien no esté conectado al inicio queda ausente con cero puntos. La ronda termina a los {t.duration_seconds} segundos.</li><li>Arena de 100 × 100, masa inicial 12 y 240 recursos. Cada recurso suma 10 puntos y 2 de masa. Una eliminación válida suma 25 puntos.</li><li>Boost: velocidad ×1,6, coste de 2 de masa por segundo y mínimo 8. El servidor resuelve colisiones y puntajes.</li><li>Desempate: puntos, mayor tiempo de supervivencia, eliminaciones y, si persiste, identificador de inscripción (cuenta) en orden estable.</li><li>Durante una desconexión tu criatura sigue en la arena. A los 10 segundos pierde su vida si aún sigue viva. Una interrupción del servidor cancela la ronda.</li></ul></details>
    <div className="flex flex-wrap gap-4"><Link href="/tournaments/snake-arena/leaderboard" className="text-sm underline">Clasificación competitiva</Link><Link href="/play/snake-arena" className="text-sm underline">Practicar Snake Arena</Link></div>
  </div>
}
