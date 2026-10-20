'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {readCompetitiveBoard,type CompetitiveBoard} from '@/lib/snake-arena/leaderboard'
export function SnakeCompetitiveLeaderboard(){
  const [board,setBoard]=useState<CompetitiveBoard|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const epoch=useRef(0)
  const load=useCallback(async(participating?:boolean)=>{
    const generation=++epoch.current;setBusy(true);setError('');setNotice('')
    try{
      const response=await fetch('/api/snake-arena/tournaments/leaderboard',{method:participating===undefined?'GET':'POST',headers:participating===undefined?undefined:{'Content-Type':'application/json'},body:participating===undefined?undefined:JSON.stringify({participating}),cache:'no-store',signal:AbortSignal.timeout(6000)})
      if(!response.ok)throw new Error('No se pudo actualizar la clasificación. Intenta nuevamente.')
      const next=readCompetitiveBoard(await response.json());if(!next)throw new Error('No se pudo confirmar la clasificación.')
      if(generation===epoch.current){setBoard(next);if(participating!==undefined)setNotice(participating?'Participación publicada.':'Participación oculta. Tus puntos y resultados se conservan.')}
    }catch(cause){if(generation===epoch.current)setError(cause instanceof Error?cause.message:'Clasificación no disponible.')}
    finally{if(generation===epoch.current)setBusy(false)}
  },[])
  useEffect(()=>{
    const generation=epoch
    const timer=setTimeout(()=>void load(),0),interval=setInterval(()=>void load(),60000)
    let authTimer:ReturnType<typeof setTimeout>|undefined
    const {data:{subscription}}=createClient().auth.onAuthStateChange((event)=>{
      if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){epoch.current++;setBoard(null);setNotice('');clearTimeout(authTimer);authTimer=setTimeout(()=>void load(),0)}
    })
    return()=>{clearTimeout(timer);clearInterval(interval);clearTimeout(authTimer);subscription.unsubscribe();generation.current++}
  },[load])
  const mine=board?.mine
  return <section className="rounded-2xl border border-teal-300/25 bg-gradient-to-br from-[#10252a] to-[#171c35] p-5 text-teal-50" aria-label="Clasificación acumulada de torneos">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Puntos de torneos</h2><button type="button" disabled={busy} onClick={()=>void load()} className="rounded-lg border border-teal-200/35 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50">{busy?'Actualizando…':'Actualizar clasificación'}</button></div>
    {mine&&<div className="mt-4 rounded-xl border border-teal-200/25 bg-teal-200/10 p-4"><p className="font-semibold">Tus puntos: {mine.points.toLocaleString('es-CL')}{mine.position!==null?` · Posición #${mine.position}`:''}</p><p className="mt-1 text-sm text-teal-100/75">{mine.wins} victorias · {mine.tournaments} torneos jugados</p><p className="mt-2 text-xs text-teal-100/75">{mine.participating?mine.tournaments?'Tu apodo y estadísticas aparecen en esta clasificación.':'Participación publicada. Juega un torneo para aparecer.':'Publica tu apodo y estadísticas para aparecer. Tu elección de práctica permanece independiente.'}</p><button type="button" disabled={busy} onClick={()=>void load(!mine.participating)} className="mt-3 rounded-lg border border-teal-200/40 bg-teal-200/15 px-4 py-2 text-sm font-semibold hover:bg-teal-200/25 disabled:opacity-50">{mine.participating?'Ocultar mi participación':'Publicar mi participación'}</button></div>}
    {board&&!mine&&<p className="mt-4 text-sm"><a href="/sign-in?next=%2Ftournaments%2Fsnake-arena%2Fleaderboard" className="underline underline-offset-4">Inicia sesión</a> para ver tus puntos y elegir si publicas tu participación.</p>}
    {board&&(board.entries.length?<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm" aria-label="Clasificación competitiva de Snake Arena"><thead className="text-xs text-teal-100/65"><tr><th scope="col" className="py-3 pr-3">Posición</th><th scope="col" className="py-3 pr-3">Jugador</th><th scope="col" className="py-3 pr-3 text-right">Puntos</th><th scope="col" className="py-3 text-right">Victorias</th></tr></thead><tbody>{board.entries.map((entry,i)=><tr key={i} className={entry.isMe?'border-t border-white/10 bg-teal-200/10':'border-t border-white/10'}><td className="py-3 pr-3 tabular-nums">#{entry.position}</td><th scope="row" className="max-w-40 break-words py-3 pr-3 font-normal">{entry.name}{entry.isMe&&<span className="ml-2 text-xs">· Tú</span>}</th><td className="py-3 pr-3 text-right font-semibold tabular-nums">{entry.points.toLocaleString('es-CL')}</td><td className="py-3 text-right tabular-nums">{entry.wins}</td></tr>)}</tbody></table></div>:<p className="mt-4 text-sm text-teal-100/80">Todavía no hay participantes publicados. Juega un torneo y publica tu participación.</p>)}
    {board&&<p className="mt-3 text-xs text-teal-100/65">{board.players} cuentas publicadas · Se muestran hasta 20 · Puntos, luego victorias; empates compartidos.</p>}
    {notice&&<p role="status" className="mt-3 text-sm text-teal-200">{notice}</p>}{error&&<p role="alert" className="mt-3 text-sm text-amber-200">{error}{board?' Se muestran los últimos datos confirmados.':''}</p>}
  </section>
}
